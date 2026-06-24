// Deterministic reducer: applies one agent tool call to the scene and returns a
// new scene plus a short text result the agent reads back. Tolerant by design —
// missing args get sane defaults, bad ids return an error string instead of
// throwing, so the agent can recover within the loop.

import {
  CSGTree,
  PrimitiveNode,
  PrimitiveType,
  Scene,
  SceneObject,
  Transform,
  Vec3,
  identityTransform,
  topTransform,
} from "./types";
import { resolveColor } from "./palette";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ApplyResult {
  scene: Scene;
  message: string;
  finished?: boolean;
}

export function applyTool(scene: Scene, call: ToolCall): ApplyResult {
  const s: Scene = structuredClone(scene);
  const a = call.args || {};
  try {
    switch (call.name) {
      case "add_box":
        return addPrimitive(s, "box", a);
      case "add_sphere":
        return addPrimitive(s, "sphere", a);
      case "add_cylinder":
        return addPrimitive(s, "cylinder", a);
      case "add_cone":
        return addPrimitive(s, "cone", a);
      case "transform":
        return transformObj(s, a);
      case "union":
        return boolOp(s, "union", a);
      case "subtract":
        return boolOp(s, "subtract", a);
      case "intersect":
        return boolOp(s, "intersect", a);
      case "mirror":
        return mirror(s, a);
      case "set_color":
        return setColor(s, a);
      case "select":
        return select(s, a);
      case "delete":
        return remove(s, a);
      case "finish":
        return { scene: s, message: `Finished: ${str(a.summary) ?? "done"}`, finished: true };
      default:
        return { scene, message: `Unknown tool "${call.name}".` };
    }
  } catch (err) {
    return { scene, message: `Error in ${call.name}: ${(err as Error).message}` };
  }
}

// ---- helpers ----------------------------------------------------------------

function newId(s: Scene): string {
  return `obj${s.nextId++}`;
}

function find(s: Scene, id: unknown): SceneObject | undefined {
  return s.objects.find((o) => o.id === id);
}

function vec3(v: unknown, fallback: Vec3): Vec3 {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number")) {
    return [v[0], v[1], v[2]] as Vec3;
  }
  return [...fallback] as Vec3;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function makeTransform(a: Record<string, unknown>): Transform {
  return {
    position: vec3(a.position, [0, 0, 0]),
    rotation: vec3(a.rotation, [0, 0, 0]),
    scale: vec3(a.scale, [1, 1, 1]),
  };
}

function addPrimitive(s: Scene, type: PrimitiveType, a: Record<string, unknown>): ApplyResult {
  const prim: PrimitiveNode = {
    kind: "primitive",
    type,
    size: vec3(a.size, [1, 1, 1]),
    radius: num(a.radius, 0.5),
    height: num(a.height, 1),
    transform: makeTransform(a),
  };
  const id = newId(s);
  const obj: SceneObject = {
    id,
    name: str(a.name) ?? type,
    color: resolveColor(str(a.color)),
    tree: prim,
  };
  s.objects.push(obj);
  s.selection = [id];
  return { scene: s, message: `Added ${type} as ${id}.` };
}

function transformObj(s: Scene, a: Record<string, unknown>): ApplyResult {
  const obj = find(s, a.id);
  if (!obj) return { scene: s, message: `transform: no object "${str(a.id)}".` };
  const t = topTransform(obj.tree);
  const relative = a.relative === true;
  if (relative) {
    if (a.position) t.position = add3(t.position, vec3(a.position, [0, 0, 0]));
    if (a.rotation) t.rotation = add3(t.rotation, vec3(a.rotation, [0, 0, 0]));
    if (a.scale) t.scale = mul3(t.scale, vec3(a.scale, [1, 1, 1]));
  } else {
    if (a.position) t.position = vec3(a.position, t.position);
    if (a.rotation) t.rotation = vec3(a.rotation, t.rotation);
    if (a.scale) t.scale = vec3(a.scale, t.scale);
  }
  return { scene: s, message: `Transformed ${obj.id}.` };
}

function boolOp(s: Scene, op: "union" | "subtract" | "intersect", a: Record<string, unknown>): ApplyResult {
  const objA = find(s, a.a);
  const objB = find(s, a.b);
  if (!objA || !objB) {
    return { scene: s, message: `${op}: need valid "a" and "b" object ids (got ${str(a.a)}, ${str(a.b)}).` };
  }
  if (objA.id === objB.id) return { scene: s, message: `${op}: a and b must differ.` };
  const tree: CSGTree = {
    kind: "compound",
    op,
    a: objA.tree,
    b: objB.tree,
    transform: identityTransform(),
  };
  const id = newId(s);
  const name = str(a.name) ?? `${objA.name}_${op}`;
  // Result inherits A's color unless overridden.
  const color = resolveColor(str(a.color), objA.color);
  // Remove operands, insert result where A was.
  const idx = s.objects.findIndex((o) => o.id === objA.id);
  s.objects = s.objects.filter((o) => o.id !== objA.id && o.id !== objB.id);
  s.objects.splice(Math.max(0, idx), 0, { id, name, color, tree });
  s.selection = [id];
  return { scene: s, message: `${op}(${objA.id}, ${objB.id}) -> ${id}.` };
}

function mirror(s: Scene, a: Record<string, unknown>): ApplyResult {
  const obj = find(s, a.id);
  if (!obj) return { scene: s, message: `mirror: no object "${str(a.id)}".` };
  const axis = (str(a.axis) ?? "x") as "x" | "y" | "z";
  const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  // Reflect across the world plane by wrapping the whole subtree in a transform
  // node with a -1 scale on that axis. The renderer bakes the child to world
  // space first, so this reflects an entire assembly (primitive OR boolean
  // compound) correctly — and it still composes with further booleans.
  const refl = identityTransform();
  refl.scale[ai] = -1;
  const clone: SceneObject = {
    id: newId(s),
    name: `${obj.name}_m`,
    color: obj.color,
    tree: { kind: "transform", child: structuredClone(obj.tree), transform: refl },
  };
  s.objects.push(clone);
  if (a.merge === true) {
    return boolOp(s, "union", { a: obj.id, b: clone.id, name: obj.name });
  }
  s.selection = [clone.id];
  return { scene: s, message: `Mirrored ${obj.id} across ${axis} -> ${clone.id}.` };
}

function setColor(s: Scene, a: Record<string, unknown>): ApplyResult {
  const obj = find(s, a.id);
  if (!obj) return { scene: s, message: `set_color: no object "${str(a.id)}".` };
  obj.color = resolveColor(str(a.color), obj.color);
  return { scene: s, message: `${obj.id} color -> ${obj.color}.` };
}

function select(s: Scene, a: Record<string, unknown>): ApplyResult {
  const ids = Array.isArray(a.ids) ? a.ids.filter((x) => typeof x === "string") : [];
  s.selection = ids.filter((id) => find(s, id));
  return { scene: s, message: `Selected: ${s.selection.join(", ") || "(none)"}.` };
}

function remove(s: Scene, a: Record<string, unknown>): ApplyResult {
  const id = str(a.id);
  if (!find(s, id)) return { scene: s, message: `delete: no object "${id}".` };
  s.objects = s.objects.filter((o) => o.id !== id);
  s.selection = s.selection.filter((x) => x !== id);
  return { scene: s, message: `Deleted ${id}.` };
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function mul3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}
