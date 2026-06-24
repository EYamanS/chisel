// Framework-agnostic modeling engine for the MCP server. Holds named in-memory
// model sessions and exposes the build/inspect/render/export operations. Kept
// separate from the MCP wiring so it can be unit-tested directly in Node.

import fs from "fs";
import path from "path";
import { Scene, emptyScene, describeScene } from "@/lib/scene/types";
import { ToolCall, applyTool } from "@/lib/scene/operations";
import { renderSceneToBase64 } from "@/lib/render/raster";
import { exportGLB, exportOBJ } from "@/lib/render/export";

const sessions = new Map<string, Scene>();
const DEFAULT = "main";

function get(session?: string): Scene {
  const key = session || DEFAULT;
  let s = sessions.get(key);
  if (!s) {
    s = emptyScene();
    sessions.set(key, s);
  }
  return s;
}

/** Apply one modeling op; returns the op result plus the updated scene graph. */
export function edit(session: string | undefined, call: ToolCall): string {
  const key = session || DEFAULT;
  const result = applyTool(get(key), call);
  sessions.set(key, result.scene);
  return `${result.message}\n\n${describeScene(result.scene)}`;
}

export function sceneText(session?: string): string {
  return describeScene(get(session));
}

export function reset(session?: string): string {
  sessions.set(session || DEFAULT, emptyScene());
  return `Session "${session || DEFAULT}" reset to an empty scene.`;
}

export function renderBase64(session?: string): string {
  return renderSceneToBase64(get(session));
}

export interface ExportResult {
  file: string;
  bytes: number;
  base64?: string;
}

export async function exportModel(
  session: string | undefined,
  format: "glb" | "obj",
  outPath?: string,
  inline = false
): Promise<ExportResult> {
  const scene = get(session);
  if (scene.objects.length === 0) throw new Error("Scene is empty — nothing to export.");

  const dir = process.env.CSG_OUTPUT_DIR || path.join(process.cwd(), "exports");
  const name = `${(session || DEFAULT).replace(/[^\w-]/g, "_")}-${Date.now()}.${format}`;
  const file = outPath || path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (format === "obj") {
    const text = exportOBJ(scene);
    fs.writeFileSync(file, text);
    return { file, bytes: Buffer.byteLength(text), base64: inline ? Buffer.from(text).toString("base64") : undefined };
  }
  const buf = await exportGLB(scene);
  fs.writeFileSync(file, buf);
  return { file, bytes: buf.length, base64: inline ? buf.toString("base64") : undefined };
}
