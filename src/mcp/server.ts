// MCP server exposing the CSG modeler so agents can build, edit, render, and
// export 3D models headlessly. Reuses the SAME modeling tool schemas as the
// in-app OpenAI agent (src/lib/scene/tools.ts) and adds get_scene / render /
// export_model / reset. Rendering is the pure-CPU software rasterizer — no GPU.
//
// Run:  npm run mcp        (stdio transport)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "@/lib/scene/tools";
import * as engine from "@/mcp/engine";

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[] };

// Modeling ops reused verbatim from the OpenAI tool set (drop loop-only ones).
const MODELING = TOOLS.filter((t) => !["finish", "select"].includes(t.function.name)).map((t) => ({
  name: t.function.name,
  description: t.function.description ?? "",
  schema: (t.function.parameters as JsonSchema) ?? { type: "object", properties: {} },
}));
const MODELING_NAMES = new Set(MODELING.map((m) => m.name));

const SESSION_PROP = {
  session: {
    type: "string",
    description: "Model session id (default 'main'). Use distinct ids to keep separate models in parallel.",
  },
};

function withSession(schema: JsonSchema): JsonSchema {
  return { ...schema, properties: { ...schema.properties, ...SESSION_PROP } };
}

const EXTRA_TOOLS = [
  {
    name: "get_scene",
    description: "Return the current model's scene graph as text (every object, its shape, and its transform).",
    inputSchema: { type: "object", properties: { ...SESSION_PROP } },
  },
  {
    name: "render",
    description:
      "Render the current model and return a PNG image: a 2x2 grid of FRONT (top-left), SIDE (top-right), TOP (bottom-left), ISO (bottom-right). Call this to SEE the model before deciding what to change.",
    inputSchema: { type: "object", properties: { ...SESSION_PROP } },
  },
  {
    name: "export_model",
    description: "Export the current model to a glTF (.glb) or Wavefront (.obj) file on disk. Returns the file path.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["glb", "obj"], description: "Output format (default glb)." },
        path: { type: "string", description: "Optional absolute output path. Defaults to ./exports/<session>-<ts>.<fmt>." },
        inline: { type: "boolean", description: "Also return the file contents base64-encoded in the response." },
        ...SESSION_PROP,
      },
    },
  },
  {
    name: "reset",
    description: "Clear the current model session back to an empty scene.",
    inputSchema: { type: "object", properties: { ...SESSION_PROP } },
  },
];

const server = new Server(
  { name: "chisel", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...MODELING.map((m) => ({ name: m.name, description: m.description, inputSchema: withSession(m.schema) })),
    ...EXTRA_TOOLS,
  ],
}));

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  const session = typeof args.session === "string" ? args.session : undefined;

  try {
    if (MODELING_NAMES.has(name)) {
      const { session: _s, ...rest } = args;
      void _s;
      return textResult(engine.edit(session, { name, args: rest }));
    }

    switch (name) {
      case "get_scene":
        return textResult(engine.sceneText(session));

      case "reset":
        return textResult(engine.reset(session));

      case "render": {
        const data = engine.renderBase64(session);
        return {
          content: [
            { type: "image" as const, data, mimeType: "image/png" },
            {
              type: "text" as const,
              text: "2x2 multi-view: top-left FRONT, top-right SIDE, bottom-left TOP, bottom-right ISO. Y is up. Cross-check all four — any single view hides geometry.",
            },
          ],
        };
      }

      case "export_model": {
        const format = args.format === "obj" ? "obj" : "glb";
        const outPath = typeof args.path === "string" ? args.path : undefined;
        const inline = args.inline === true;
        const r = await engine.exportModel(session, format, outPath, inline);
        const base = `Exported ${format.toUpperCase()} -> ${r.file} (${r.bytes} bytes).`;
        return textResult(r.base64 ? `${base}\n\nbase64:\n${r.base64}` : base);
      }

      default:
        return errorResult(`Unknown tool "${name}".`);
    }
  } catch (err) {
    return errorResult(`Error in ${name}: ${(err as Error).message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport owns stdout for JSON-RPC; log to stderr only.
  console.error("[chisel] MCP server ready on stdio.");
}

main().catch((err) => {
  console.error("[chisel] fatal:", err);
  process.exit(1);
});
