// Headless glTF/OBJ export. Three's exporters operate on the object graph with
// no GPU, so this runs in plain Node. We have no textures (just per-object solid
// colors), so GLTFExporter's binary path needs no canvas/DOM.

import { Scene } from "@/lib/scene/types";
import { buildSceneGroup } from "@/lib/three/build";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";

// GLTFExporter's binary path reads a Blob via FileReader (a browser API). Node
// has Blob but not FileReader, so provide a minimal shim. GLTFExporter listens
// via addEventListener('loadend', ...), so the shim must dispatch real events,
// not just the on* properties. No-op in the browser.
const g = globalThis as unknown as { FileReader?: unknown };
if (typeof g.FileReader === "undefined") {
  type Handler = (ev: { target: unknown }) => void;
  g.FileReader = class {
    result: ArrayBuffer | string | null = null;
    error: unknown = null;
    onload: Handler | null = null;
    onloadend: Handler | null = null;
    onerror: Handler | null = null;
    private listeners: Record<string, Handler[]> = {};
    addEventListener(type: string, cb: Handler) {
      (this.listeners[type] ||= []).push(cb);
    }
    removeEventListener(type: string, cb: Handler) {
      this.listeners[type] = (this.listeners[type] || []).filter((h) => h !== cb);
    }
    private emit(type: "load" | "loadend" | "error") {
      const ev = { target: this };
      if (type === "load") this.onload?.(ev);
      if (type === "loadend") this.onloadend?.(ev);
      if (type === "error") this.onerror?.(ev);
      (this.listeners[type] || []).forEach((cb) => cb(ev));
    }
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then(
        (buf) => {
          this.result = buf;
          this.emit("load");
          this.emit("loadend");
        },
        (e) => {
          this.error = e;
          this.emit("error");
          this.emit("loadend");
        }
      );
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then(
        (buf) => {
          const type = blob.type || "application/octet-stream";
          this.result = `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
          this.emit("load");
          this.emit("loadend");
        },
        (e) => {
          this.error = e;
          this.emit("error");
          this.emit("loadend");
        }
      );
    }
  };
}

export function exportOBJ(scene: Scene): string {
  return new OBJExporter().parse(buildSceneGroup(scene));
}

export function exportGLB(scene: Scene): Promise<Buffer> {
  const group = buildSceneGroup(scene);
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(Buffer.from(result));
        else reject(new Error("Expected binary GLB output from GLTFExporter."));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true }
    );
  });
}
