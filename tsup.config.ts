import { defineConfig } from "tsup";
import path from "node:path";

// Bundles the MCP server into a single self-contained CJS binary.
// - three / three-bvh-csg are inlined (they're ESM; inlining avoids require(esm)
//   issues on older Node and keeps runtime deps minimal).
// - @modelcontextprotocol/sdk stays external (ships its own CJS build).
export default defineConfig({
  entry: { server: "src/mcp/server.ts" },
  outDir: "dist",
  format: ["cjs"],
  platform: "node",
  target: "node18",
  clean: true,
  dts: false,
  minify: false,
  external: [/^@modelcontextprotocol\/sdk/],
  noExternal: ["three", "three-bvh-csg"],
  banner: { js: "#!/usr/bin/env node" },
  esbuildOptions(options) {
    options.alias = { "@": path.resolve(process.cwd(), "src") };
  },
});
