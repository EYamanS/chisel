"use client";

import { useRef, useState } from "react";
import Viewport, { ViewportHandle } from "@/components/Viewport";
import { Scene, emptyScene, describeScene } from "@/lib/scene/types";
import { applyTool } from "@/lib/scene/operations";
import { runAgent, LogEntry } from "@/lib/agent/loop";
import { DEMOS, Demo } from "@/lib/agent/demo";

export default function Home() {
  const viewportRef = useRef<ViewportHandle>(null);
  const stopRef = useRef(false);
  const sceneRef = useRef<Scene>(emptyScene());

  const [scene, setSceneState] = useState<Scene>(emptyScene());
  const [goal, setGoal] = useState("a wooden chair");
  const [maxSteps, setMaxSteps] = useState(24);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [agentView, setAgentView] = useState<string | null>(null);

  const setScene = (s: Scene) => {
    sceneRef.current = s;
    setSceneState(s);
  };

  const pushLog = (e: LogEntry) => setLog((prev) => [...prev, e]);

  const reset = () => {
    const fresh = emptyScene();
    setScene(fresh);
    viewportRef.current?.setScene(fresh);
    setLog([]);
    setAgentView(null);
  };

  const onBuild = async () => {
    if (!goal.trim() || running) return;
    setRunning(true);
    stopRef.current = false;
    reset();
    pushLog({ kind: "info", text: `Building: ${goal}` });
    await runAgent(goal, maxSteps, {
      viewport: viewportRef.current!,
      getScene: () => sceneRef.current,
      setScene,
      log: pushLog,
      shouldStop: () => stopRef.current,
      onImage: setAgentView,
    });
    viewportRef.current?.fit();
    setRunning(false);
  };

  const onDemo = (demo: Demo) => {
    if (running) return;
    let s = emptyScene();
    for (const call of demo.calls) s = applyTool(s, call).scene;
    setScene(s);
    viewportRef.current?.setScene(s);
    viewportRef.current?.fit();
    // Show exactly what the agent would see — instant capture sanity check.
    setAgentView(viewportRef.current?.capture() ?? null);
    setLog([{ kind: "info", text: `Loaded demo "${demo.name}"` }, { kind: "tool", text: describeScene(s) }]);
  };

  const selectObj = (id: string) => {
    const s = applyTool(sceneRef.current, { name: "select", args: { ids: [id] } }).scene;
    setScene(s);
    viewportRef.current?.setScene(s);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0d1014] text-neutral-200">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <h1 className="mr-2 text-sm font-semibold tracking-tight text-neutral-100">
          CSG&nbsp;<span className="text-sky-400">Agent</span> · primitive 3D modeler
        </h1>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onBuild()}
          placeholder="describe an object…"
          disabled={running}
          className="min-w-[220px] flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
        />
        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          steps
          <input
            type="number"
            min={4}
            max={60}
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            disabled={running}
            className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
          />
        </label>
        {running ? (
          <button
            onClick={() => (stopRef.current = true)}
            className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onBuild}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            Build
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Viewport */}
        <main className="relative min-w-0 flex-1">
          <Viewport ref={viewportRef} />
          <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-neutral-500">
            drag to orbit · scroll to zoom · Y is up
          </div>
        </main>

        {/* Side panel */}
        <aside className="flex w-[340px] flex-col border-l border-neutral-800">
          <Section title="Demos (no API key needed)">
            <div className="flex flex-wrap gap-2">
              {DEMOS.map((d) => (
                <button
                  key={d.name}
                  onClick={() => onDemo(d)}
                  disabled={running}
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:border-sky-600 disabled:opacity-50"
                >
                  {d.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title={`Objects (${scene.objects.length})`}>
            <div className="max-h-40 overflow-auto">
              {scene.objects.length === 0 ? (
                <p className="text-xs text-neutral-500">empty scene</p>
              ) : (
                scene.objects.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => selectObj(o.id)}
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-neutral-800 ${
                      scene.selection.includes(o.id) ? "bg-neutral-800 text-sky-300" : "text-neutral-300"
                    }`}
                  >
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: o.color }} />
                    <span className="font-mono">{o.id}</span>
                    <span className="truncate text-neutral-500">{o.name}</span>
                  </button>
                ))
              )}
            </div>
          </Section>

          <Section title="Export">
            <div className="flex gap-2">
              <button
                onClick={() => viewportRef.current?.exportGLB()}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:border-sky-600"
              >
                .glb
              </button>
              <button
                onClick={() => viewportRef.current?.exportOBJ()}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:border-sky-600"
              >
                .obj
              </button>
              <button
                onClick={() => viewportRef.current?.fit()}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:border-sky-600"
              >
                fit view
              </button>
            </div>
          </Section>

          <Section title="What the agent sees">
            {agentView ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agentView}
                alt="multi-view the agent receives"
                className="w-full rounded border border-neutral-700"
              />
            ) : (
              <p className="text-xs text-neutral-500">
                Runs/demos show the exact 2×2 render sent to the model here.
              </p>
            )}
          </Section>

          <div className="flex min-h-0 flex-1 flex-col border-t border-neutral-800">
            <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Agent log
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed">
              {log.length === 0 ? (
                <p className="text-neutral-600">
                  Press Build to run the agent, or try a demo. Set OPENAI_API_KEY in .env.local to enable Build.
                </p>
              ) : (
                log.map((e, i) => (
                  <div key={i} className={logColor(e.kind)}>
                    {prefix(e.kind)}
                    {e.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-neutral-800 px-3 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
      {children}
    </div>
  );
}

function logColor(kind: LogEntry["kind"]): string {
  switch (kind) {
    case "assistant":
      return "text-neutral-300 whitespace-pre-wrap";
    case "tool":
      return "text-emerald-400/90 whitespace-pre-wrap";
    case "error":
      return "text-red-400 whitespace-pre-wrap";
    default:
      return "text-sky-400 whitespace-pre-wrap";
  }
}

function prefix(kind: LogEntry["kind"]): string {
  return kind === "tool" ? "› " : kind === "error" ? "✗ " : kind === "assistant" ? "» " : "• ";
}
