// OpenAI function-calling schemas for every modeling op. Lives server-side
// (attached in the API route) so the client payload stays small.

import type OpenAI from "openai";

type Tool = OpenAI.Chat.Completions.ChatCompletionFunctionTool;

const vec3 = (desc: string) => ({
  type: "array" as const,
  items: { type: "number" as const },
  minItems: 3,
  maxItems: 3,
  description: desc,
});

const transformProps = {
  position: vec3("World position [x,y,z]. Y is up."),
  rotation: vec3("Euler rotation in DEGREES [x,y,z]."),
  scale: vec3("Scale [x,y,z]."),
  color: { type: "string", description: "Palette name or #rrggbb hex." },
  name: { type: "string", description: "Short human label." },
};

export const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "add_box",
      description: "Add a box primitive. Returns its object id (objN).",
      parameters: {
        type: "object",
        properties: { size: vec3("Box dimensions [w,h,d]."), ...transformProps },
        required: ["size"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_sphere",
      description: "Add a sphere primitive.",
      parameters: {
        type: "object",
        properties: { radius: { type: "number" }, ...transformProps },
        required: ["radius"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_cylinder",
      description: "Add a cylinder primitive (axis along Y before rotation).",
      parameters: {
        type: "object",
        properties: { radius: { type: "number" }, height: { type: "number" }, ...transformProps },
        required: ["radius", "height"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_cone",
      description: "Add a cone primitive (apex +Y, base -Y, before rotation).",
      parameters: {
        type: "object",
        properties: { radius: { type: "number" }, height: { type: "number" }, ...transformProps },
        required: ["radius", "height"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transform",
      description: "Set or offset an object's position/rotation/scale.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          position: vec3("[x,y,z]"),
          rotation: vec3("degrees [x,y,z]"),
          scale: vec3("[x,y,z]"),
          relative: { type: "boolean", description: "If true, add/multiply onto current values instead of replacing." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "union",
      description: "Boolean union: merge a and b into one object. Consumes both.",
      parameters: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" }, name: { type: "string" }, color: { type: "string" } },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subtract",
      description: "Boolean subtract: cut b out of a. Consumes both, yields new object.",
      parameters: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" }, name: { type: "string" } },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "intersect",
      description: "Boolean intersect: keep only the overlap of a and b. Consumes both.",
      parameters: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" }, name: { type: "string" } },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mirror",
      description: "Duplicate an object reflected across a plane. Use for symmetry (build one side, mirror it).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          axis: { type: "string", enum: ["x", "y", "z"], description: "Plane normal to reflect across (x = mirror left/right)." },
          merge: { type: "boolean", description: "If true, union the mirror back into the original." },
        },
        required: ["id", "axis"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_color",
      description: "Recolor an object.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, color: { type: "string" } },
        required: ["id", "color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select",
      description: "Set the current selection (highlighted in renders).",
      parameters: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" } } },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete",
      description: "Delete an object.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Call when the model matches the goal across all four views.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "One line: what you built." } },
        required: ["summary"],
      },
    },
  },
];
