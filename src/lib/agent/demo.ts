// Hardcoded tool-call sequences. Let you exercise the full engine (CSG, render,
// multi-view, export) without an API key — and double as proof the boolean ops
// produce clean geometry.

import { ToolCall } from "@/lib/scene/operations";

export interface Demo {
  name: string;
  goal: string;
  calls: ToolCall[];
}

export const DEMOS: Demo[] = [
  {
    name: "Mug",
    goal: "a coffee mug",
    calls: [
      { name: "add_cylinder", args: { radius: 0.6, height: 1.2, position: [0, 0.6, 0], color: "steel", name: "body" } },
      { name: "add_cylinder", args: { radius: 0.48, height: 1.1, position: [0, 0.72, 0], name: "cavity" } },
      { name: "subtract", args: { a: "obj1", b: "obj2", name: "cup" } },
      { name: "add_box", args: { size: [0.16, 0.62, 0.16], position: [0.66, 0.62, 0], color: "steel", name: "handle" } },
      { name: "add_box", args: { size: [0.16, 0.16, 0.16], position: [0.78, 0.9, 0] } },
      { name: "add_box", args: { size: [0.16, 0.16, 0.16], position: [0.78, 0.34, 0] } },
      { name: "union", args: { a: "obj3", b: "obj4" } },
      { name: "union", args: { a: "obj6", b: "obj5" } },
      { name: "union", args: { a: "obj7", b: "obj8", name: "mug" } },
      { name: "finish", args: { summary: "hollow mug with a handle" } },
    ],
  },
  {
    name: "Table",
    goal: "a four-legged table",
    calls: [
      { name: "add_box", args: { size: [3, 0.2, 2], position: [0, 1.6, 0], color: "wood", name: "top" } },
      { name: "add_box", args: { size: [0.2, 1.6, 0.2], position: [1.3, 0.8, 0.8], color: "wood", name: "leg" } },
      { name: "mirror", args: { id: "obj2", axis: "x" } },
      { name: "union", args: { a: "obj2", b: "obj3" } },
      { name: "mirror", args: { id: "obj4", axis: "z" } },
      { name: "union", args: { a: "obj4", b: "obj5" } },
      { name: "union", args: { a: "obj1", b: "obj6", name: "table" } },
      { name: "finish", args: { summary: "table top on four mirrored legs" } },
    ],
  },
  {
    name: "Rocket",
    goal: "a toy rocket",
    calls: [
      { name: "add_cylinder", args: { radius: 0.6, height: 2.4, position: [0, 1.5, 0], color: "silver", name: "fuselage" } },
      { name: "add_cone", args: { radius: 0.6, height: 1, position: [0, 3.2, 0], color: "rust", name: "nose" } },
      { name: "union", args: { a: "obj1", b: "obj2", name: "rocket" } },
      { name: "add_box", args: { size: [0.1, 0.8, 0.7], position: [0.6, 0.6, 0], color: "rust", name: "fin" } },
      { name: "transform", args: { id: "obj4", rotation: [0, 0, -18] } },
      { name: "mirror", args: { id: "obj4", axis: "x" } },
      { name: "union", args: { a: "obj4", b: "obj5" } },
      { name: "union", args: { a: "obj3", b: "obj6", name: "rocket" } },
      { name: "finish", args: { summary: "fuselage + nose cone + two fins" } },
    ],
  },
];
