// Client-side agent driver. The browser owns the WebGL renderer, so the loop
// runs here: apply tool calls -> rebuild model -> capture 2x2 multi-view ->
// send to /api/agent -> get next tool calls -> repeat. The API key never leaves
// the server (the route proxies to OpenAI).

import { Scene, describeScene } from "@/lib/scene/types";
import { ToolCall, applyTool } from "@/lib/scene/operations";
import { systemPrompt, firstUserText, continueUserText } from "@/lib/agent/prompts";
import type { ViewportHandle } from "@/components/Viewport";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

interface ToolCallWire {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface Msg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCallWire[];
  tool_call_id?: string;
}

export interface LogEntry {
  kind: "assistant" | "tool" | "error" | "info";
  text: string;
}

export interface AgentHooks {
  viewport: ViewportHandle;
  getScene: () => Scene;
  setScene: (s: Scene) => void;
  log: (e: LogEntry) => void;
  shouldStop: () => boolean;
  onImage?: (dataUrl: string) => void;
}

// Keep images only on the most recent user message; replace older ones with a
// placeholder so history stays cheap (vision on current state, text for the past).
function stripOldImages(messages: Msg[]) {
  for (const m of messages) {
    if (m.role === "user" && Array.isArray(m.content)) {
      m.content = m.content.map((p) =>
        p.type === "image_url" ? { type: "text", text: "[earlier render omitted]" } : p
      );
    }
  }
}

async function callModel(messages: Msg[]): Promise<Msg> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Agent API ${res.status}: ${detail}`);
  }
  return (await res.json()) as Msg;
}

// Don't honor finish() until the agent has gone through a few render-review
// passes — otherwise capable models one-shot the build and bail before iterating.
const REVIEW_MIN_STEPS = 4;

export async function runAgent(goal: string, maxSteps: number, hooks: AgentHooks): Promise<void> {
  const messages: Msg[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: [{ type: "text", text: firstUserText(goal) }] },
  ];

  let emptyTurns = 0;

  for (let step = 1; step <= maxSteps; step++) {
    if (hooks.shouldStop()) {
      hooks.log({ kind: "info", text: "Stopped." });
      return;
    }

    let assistant: Msg;
    try {
      assistant = await callModel(messages);
    } catch (err) {
      hooks.log({ kind: "error", text: (err as Error).message });
      return;
    }
    messages.push(assistant);

    if (typeof assistant.content === "string" && assistant.content.trim()) {
      hooks.log({ kind: "assistant", text: assistant.content.trim() });
    }

    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) {
      emptyTurns++;
      if (emptyTurns >= 2) {
        hooks.log({ kind: "info", text: "Agent stopped making changes." });
        return;
      }
      messages.push({
        role: "user",
        content: [{ type: "text", text: "Continue with tool calls, or call finish() if the model is complete." }],
      });
      continue;
    }
    emptyTurns = 0;

    // Apply every tool call; each must get a matching tool result message.
    let scene = hooks.getScene();
    let finished = false;
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {
        // leave args empty; reducer tolerates it
      }
      const call: ToolCall = { name: c.function.name, args };
      const result = applyTool(scene, call);

      // Gate premature finish: force at least a few view→revise cycles so the
      // agent actually uses the renders instead of one-shotting and bailing.
      if (result.finished && step < REVIEW_MIN_STEPS) {
        hooks.log({ kind: "info", text: "finish too early — pushing it to keep refining" });
        messages.push({
          role: "tool",
          tool_call_id: c.id,
          content: `Finish rejected: only ${step} pass(es) so far. Look carefully at all four views in the latest render, fix the single biggest problem with proportions or placement, and continue.`,
        });
        continue;
      }

      scene = result.scene;
      if (result.finished) finished = true;
      hooks.log({ kind: "tool", text: `${c.function.name} → ${result.message}` });
      messages.push({ role: "tool", tool_call_id: c.id, content: result.message });
    }

    hooks.setScene(scene);
    hooks.viewport.setScene(scene);

    if (finished) {
      hooks.viewport.fit();
      hooks.log({ kind: "info", text: "Model complete." });
      return;
    }

    // Render the new state and feed it back.
    const image = hooks.viewport.capture();
    hooks.onImage?.(image);
    stripOldImages(messages);
    messages.push({
      role: "user",
      content: [
        // detail:"high" forces full-resolution processing — otherwise the API
        // downsamples our 1024px composite to a blurry thumbnail the model
        // effectively can't read.
        { type: "image_url", image_url: { url: image, detail: "high" } },
        { type: "text", text: continueUserText(describeScene(scene), step, maxSteps) },
      ],
    });
  }

  hooks.log({ kind: "info", text: `Reached step limit (${maxSteps}).` });
}
