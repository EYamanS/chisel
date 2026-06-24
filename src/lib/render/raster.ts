// Pure-CPU software renderer: scene graph -> 2x2 multi-view PNG. No WebGL, no
// browser. It extracts the evaluated CSG triangles (already world-space) and
// rasterizes them with an orthographic projection, z-buffer, and flat shading.
// This is what lets the engine render its own state headlessly (MCP server,
// scripts, CI) instead of needing a GPU context.

import * as THREE from "three";
import { Scene } from "@/lib/scene/types";
import { buildSceneGroup } from "@/lib/three/build";
import { encodePNG } from "./png";
import { drawLabel, labelWidth } from "./font";

type RGB = [number, number, number];

const CELL = 384; // px per view; composite is 2*CELL square
const AMBIENT = 0.4;
const LIGHT = new THREE.Vector3(0.5, 0.85, 0.45).normalize();
const BG: RGB = [0x6e, 0x75, 0x7d];
const GROUND: RGB = [0x4a, 0x4f, 0x57];
const GAP: RGB = [0x12, 0x15, 0x19];

const VIEWS = [
  { label: "FRONT", dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { label: "SIDE", dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { label: "TOP", dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  { label: "ISO", dir: new THREE.Vector3(1, 0.85, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
];

interface Tri {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  color: RGB;
}

function hexToRGB(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function collectTris(scene: Scene): { tris: Tri[]; box: THREE.Box3 } {
  const group = buildSceneGroup(scene);
  const box = new THREE.Box3().setFromObject(group);
  const colorById = new Map(scene.objects.map((o) => [o.id, hexToRGB(o.color)] as const));
  const tris: Tri[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const color = colorById.get(mesh.name) ?? ([200, 200, 200] as RGB);
    const push = (i0: number, i1: number, i2: number) =>
      tris.push({
        a: new THREE.Vector3().fromBufferAttribute(pos, i0),
        b: new THREE.Vector3().fromBufferAttribute(pos, i1),
        c: new THREE.Vector3().fromBufferAttribute(pos, i2),
        color,
      });
    const idx = geo.getIndex();
    if (idx) for (let i = 0; i < idx.count; i += 3) push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    else for (let i = 0; i < pos.count; i += 3) push(i, i + 1, i + 2);
  });
  return { tris, box };
}

// A large floor quad at the model's base, for ground reference.
function groundTris(box: THREE.Box3): Tri[] {
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.z, 1) * 6;
  const y = box.min.y;
  const p = (x: number, z: number) => new THREE.Vector3(c.x + x, y, c.z + z);
  return [
    { a: p(-r, -r), b: p(r, -r), c: p(r, r), color: GROUND },
    { a: p(-r, -r), b: p(r, r), c: p(-r, r), color: GROUND },
  ];
}

function edge(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

function renderView(tris: Tri[], center: THREE.Vector3, half: number, view: (typeof VIEWS)[number]): Uint8Array {
  const W = CELL;
  const H = CELL;
  const color = new Uint8Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) {
    color[i * 3] = BG[0];
    color[i * 3 + 1] = BG[1];
    color[i * 3 + 2] = BG[2];
  }

  const eye = center.clone().addScaledVector(view.dir, half * 10);
  const f = view.dir.clone().multiplyScalar(-1).normalize(); // forward, toward center
  const s = new THREE.Vector3().crossVectors(f, view.up).normalize(); // right
  const u = new THREE.Vector3().crossVectors(s, f).normalize(); // true up

  const d = new THREE.Vector3();
  const project = (p: THREE.Vector3) => {
    d.subVectors(p, eye);
    const sx = (d.dot(s) / half) * 0.5 + 0.5;
    const sy = 1 - ((d.dot(u) / half) * 0.5 + 0.5);
    return { x: sx * W, y: sy * H, z: d.dot(f) }; // z = forward distance from eye (smaller = nearer)
  };

  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const t of tris) {
    e1.subVectors(t.b, t.a);
    e2.subVectors(t.c, t.b);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    if (n.dot(f) > 0) n.multiplyScalar(-1); // two-sided: face the camera for lighting

    const A = project(t.a);
    const B = project(t.b);
    const C = project(t.c);
    const area = edge(A.x, A.y, B.x, B.y, C.x, C.y);
    if (Math.abs(area) < 1e-9) continue;

    const diff = Math.max(0, n.dot(LIGHT));
    const k = AMBIENT + (1 - AMBIENT) * diff;
    const r = Math.min(255, t.color[0] * k) | 0;
    const g = Math.min(255, t.color[1] * k) | 0;
    const bl = Math.min(255, t.color[2] * k) | 0;

    const minX = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(A.x, B.x, C.x)));
    const minY = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(A.y, B.y, C.y)));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5;
        const sy = py + 0.5;
        const w0 = edge(B.x, B.y, C.x, C.y, sx, sy);
        const w1 = edge(C.x, C.y, A.x, A.y, sx, sy);
        const w2 = edge(A.x, A.y, B.x, B.y, sx, sy);
        const inside = (w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0);
        if (!inside) continue;
        const z = (w0 * A.z + w1 * B.z + w2 * C.z) / area;
        const idx = py * W + px;
        if (z < depth[idx]) {
          depth[idx] = z;
          color[idx * 3] = r;
          color[idx * 3 + 1] = g;
          color[idx * 3 + 2] = bl;
        }
      }
    }
  }
  return color;
}

/** Render the scene to a 2x2 multi-view PNG (front / side / top / iso). */
export function renderSceneToPNG(scene: Scene): Buffer {
  const { tris, box } = collectTris(scene);
  const fit = box.isEmpty()
    ? new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1))
    : box;
  const center = fit.getCenter(new THREE.Vector3());
  const size = fit.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const half = maxDim * 0.62;
  const all = [...groundTris(fit), ...tris];

  const W = CELL * 2;
  const H = CELL * 2;
  const comp = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    comp[i * 3] = GAP[0];
    comp[i * 3 + 1] = GAP[1];
    comp[i * 3 + 2] = GAP[2];
  }

  VIEWS.forEach((v, i) => {
    const cell = renderView(all, center, half, v);
    const ox = (i % 2) * CELL;
    const oy = Math.floor(i / 2) * CELL;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const si = (y * CELL + x) * 3;
        const di = ((oy + y) * W + (ox + x)) * 3;
        comp[di] = cell[si];
        comp[di + 1] = cell[si + 1];
        comp[di + 2] = cell[si + 2];
      }
    }
    // Label chip.
    const lw = labelWidth(v.label, 2) + 8;
    for (let y = oy + 6; y < oy + 30; y++) {
      for (let x = ox + 6; x < ox + 6 + lw; x++) {
        const di = (y * W + x) * 3;
        comp[di] = 12;
        comp[di + 1] = 14;
        comp[di + 2] = 18;
      }
    }
    drawLabel(comp, W, H, ox + 10, oy + 11, v.label, 2);
  });

  return encodePNG(comp, W, H);
}

export function renderSceneToBase64(scene: Scene): string {
  return renderSceneToPNG(scene).toString("base64");
}
