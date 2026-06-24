# Chisel — contributor guide

Chisel is an MCP server (plus an optional Next.js web playground) that lets AI agents
build, edit, render, and export 3D models from primitives and boolean CSG.

## Where things live

- `src/lib/scene/` — the scene graph (`types.ts`), the deterministic op reducer
  (`operations.ts`), and the shared modeling tool schemas (`tools.ts`).
- `src/lib/three/build.ts` — turns the scene graph into Three.js meshes, evaluating CSG
  booleans with `three-bvh-csg`. Pure CPU; no GPU needed.
- `src/lib/render/` — the headless software rasterizer (`raster.ts`), glTF/OBJ export
  (`export.ts`), a zero-dependency PNG encoder (`png.ts`), and a bitmap label font.
- `src/mcp/` — the MCP server (`server.ts`) and its in-memory session store (`engine.ts`).
- `src/lib/agent/`, `src/components/`, `src/app/` — the browser playground (WebGL viewport
  + OpenAI-driven agent loop).

## Conventions

- Geometry is **Y-up, right-handed**. Rotations are stored in **degrees**.
- The renderer and exporters must stay **headless** (no `window`, no WebGL) — they run in
  Node for the MCP server.
- The same `src/lib/scene/tools.ts` schemas feed both the MCP server and the web agent;
  keep them in sync.

## Commands

- `npm run mcp` — run the MCP server from source (tsx).
- `npm run build:mcp` — bundle the standalone binary to `dist/server.js`.
- `npm run dev` — web playground at http://localhost:3000.
- `npx tsc --noEmit` — typecheck the whole project.
