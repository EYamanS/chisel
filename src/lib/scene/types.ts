// Core scene-graph model for the CSG engine.
//
// A Scene is a flat list of SceneObjects. Each object is a CSG expression tree
// (a primitive leaf, or a boolean compound of two subtrees). The flat list is
// what the agent reads back as text; booleans are destructive from the agent's
// point of view (subtract(a,b) consumes a and b, yields a new object) but the
// full tree is retained so the renderer can rebuild exact geometry every frame.

export type Vec3 = [number, number, number];

export type PrimitiveType = "box" | "sphere" | "cylinder" | "cone";
export type BoolOp = "union" | "subtract" | "intersect";

export interface Transform {
  position: Vec3;
  rotation: Vec3; // Euler angles in DEGREES
  scale: Vec3;
}

export interface PrimitiveNode {
  kind: "primitive";
  type: PrimitiveType;
  size: Vec3; // box: [w,h,d]
  radius: number; // sphere/cylinder/cone
  height: number; // cylinder/cone
  transform: Transform;
}

export interface CompoundNode {
  kind: "compound";
  op: BoolOp;
  a: CSGTree;
  b: CSGTree;
  transform: Transform; // applied to the evaluated boolean result
}

// Wraps a subtree and applies an outer world-space transform to its baked
// geometry. Used by mirror() to reflect a whole assembly (a negative-scale axis
// reflects across the world plane), which composes cleanly with booleans.
export interface TransformNode {
  kind: "transform";
  child: CSGTree;
  transform: Transform;
}

export type CSGTree = PrimitiveNode | CompoundNode | TransformNode;

export interface SceneObject {
  id: string;
  name: string;
  color: string; // hex, e.g. "#c0c0c0"
  tree: CSGTree;
}

export interface Scene {
  objects: SceneObject[];
  selection: string[];
  nextId: number;
}

export function emptyScene(): Scene {
  return { objects: [], selection: [], nextId: 1 };
}

export function identityTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

// A compact text view of the scene that the agent reads each turn. Kept small
// and stable so the model can reason about spatial relationships precisely.
export function describeScene(scene: Scene): string {
  if (scene.objects.length === 0) return "Scene is empty.";
  const lines = scene.objects.map((o) => {
    const t = topTransform(o.tree);
    const pos = t.position.map((n) => round(n)).join(", ");
    const rot = t.rotation.map((n) => round(n)).join(", ");
    const scl = t.scale.map((n) => round(n)).join(", ");
    const shape = describeTree(o.tree);
    const sel = scene.selection.includes(o.id) ? " [selected]" : "";
    return `- ${o.id} "${o.name}" ${o.color}${sel}: ${shape} | pos(${pos}) rot(${rot})deg scale(${scl})`;
  });
  return `${scene.objects.length} object(s):\n${lines.join("\n")}`;
}

function describeTree(t: CSGTree): string {
  if (t.kind === "primitive") {
    switch (t.type) {
      case "box":
        return `box ${t.size.map(round).join("x")}`;
      case "sphere":
        return `sphere r=${round(t.radius)}`;
      case "cylinder":
        return `cylinder r=${round(t.radius)} h=${round(t.height)}`;
      case "cone":
        return `cone r=${round(t.radius)} h=${round(t.height)}`;
    }
  }
  if (t.kind === "transform") {
    const ax = t.transform.scale.findIndex((v) => v < 0);
    const tag = ax >= 0 ? `mirror-${["x", "y", "z"][ax]}` : "xform";
    return `${tag}(${describeTree(t.child)})`;
  }
  return `(${describeTree(t.a)} ${t.op} ${describeTree(t.b)})`;
}

export function topTransform(t: CSGTree): Transform {
  return t.transform;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
