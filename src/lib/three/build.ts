// Turns the scene graph into Three.js meshes, evaluating CSG booleans with
// three-bvh-csg. Rebuilt from scratch each time the scene changes — geometry is
// cheap to regenerate and this keeps state dead-simple (no incremental diffing).
//
// Invariant: buildBrush() always returns a Brush whose geometry is already in
// WORLD space with an identity matrix. That uniformity is what lets a reflection
// (a transform node with a negative-scale axis) reflect an entire boolean
// assembly across a world plane and still compose with further booleans.

import * as THREE from "three";
import { ADDITION, SUBTRACTION, INTERSECTION, Brush, Evaluator } from "three-bvh-csg";
import { CSGTree, PrimitiveNode, Scene, SceneObject, Transform } from "@/lib/scene/types";

const DEG = Math.PI / 180;

function primitiveGeometry(p: PrimitiveNode): THREE.BufferGeometry {
  switch (p.type) {
    case "box":
      return new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
    case "sphere":
      return new THREE.SphereGeometry(p.radius, 48, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(p.radius, p.radius, p.height, 48);
    case "cone":
      return new THREE.ConeGeometry(p.radius, p.height, 48);
  }
}

function composeMatrix(t: Transform): THREE.Matrix4 {
  const pos = new THREE.Vector3(t.position[0], t.position[1], t.position[2]);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG)
  );
  const scl = new THREE.Vector3(t.scale[0], t.scale[1], t.scale[2]);
  return new THREE.Matrix4().compose(pos, quat, scl);
}

// Reverse triangle winding so that a reflected (negative-determinant) geometry
// keeps outward-facing orientation — required both for correct lighting and for
// three-bvh-csg's inside/outside tests.
function flipWinding(geom: THREE.BufferGeometry) {
  const index = geom.getIndex();
  if (index) {
    const a = index.array as Uint32Array | Uint16Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    index.needsUpdate = true;
    return;
  }
  for (const name of Object.keys(geom.attributes)) {
    const attr = geom.attributes[name] as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const s = attr.itemSize;
    for (let i = 0; i < arr.length; i += s * 3) {
      for (let k = 0; k < s; k++) {
        const i1 = i + s + k;
        const i2 = i + 2 * s + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
    attr.needsUpdate = true;
  }
}

function applyMatrix(geom: THREE.BufferGeometry, m: THREE.Matrix4) {
  geom.applyMatrix4(m);
  const det = new THREE.Matrix3().setFromMatrix4(m).determinant();
  if (det < 0) flipWinding(geom);
}

function buildBrush(tree: CSGTree, evaluator: Evaluator): Brush {
  if (tree.kind === "primitive") {
    const geom = primitiveGeometry(tree);
    applyMatrix(geom, composeMatrix(tree.transform));
    const brush = new Brush(geom);
    brush.updateMatrixWorld(true);
    return brush;
  }
  if (tree.kind === "transform") {
    const child = buildBrush(tree.child, evaluator);
    applyMatrix(child.geometry, composeMatrix(tree.transform));
    child.updateMatrixWorld(true);
    return child;
  }
  // compound
  const a = buildBrush(tree.a, evaluator);
  const b = buildBrush(tree.b, evaluator);
  const op = tree.op === "union" ? ADDITION : tree.op === "subtract" ? SUBTRACTION : INTERSECTION;
  const result = evaluator.evaluate(a, b, op) as Brush;
  applyMatrix(result.geometry, composeMatrix(tree.transform));
  result.updateMatrixWorld(true);
  return result;
}

export function buildObjectMesh(obj: SceneObject, evaluator: Evaluator, selected: boolean): THREE.Mesh {
  const brush = buildBrush(obj.tree, evaluator);
  const geometry = brush.geometry;
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(obj.color),
    metalness: 0.05,
    roughness: 0.65,
    emissive: selected ? new THREE.Color(0x224488) : new THREE.Color(0x000000),
    emissiveIntensity: selected ? 0.5 : 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = obj.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Build a fresh group containing one mesh per scene object.
export function buildSceneGroup(scene: Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = "model";
  const evaluator = new Evaluator();
  evaluator.useGroups = false; // single material per result
  for (const obj of scene.objects) {
    try {
      const mesh = buildObjectMesh(obj, evaluator, scene.selection.includes(obj.id));
      group.add(mesh);
    } catch {
      // A degenerate boolean can fail; skip that object rather than crash the
      // whole render so the agent still sees everything else.
    }
  }
  return group;
}
