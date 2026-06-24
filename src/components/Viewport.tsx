"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Scene as SceneGraph } from "@/lib/scene/types";
import { buildSceneGroup } from "@/lib/three/build";

export interface ViewportHandle {
  setScene: (scene: SceneGraph) => void;
  capture: () => string;
  exportGLB: () => void;
  exportOBJ: () => void;
  fit: () => void;
}

const CELL = 512; // px per view in the capture composite

// Camera setups for the 2x2 multi-view capture. dir = direction FROM target TO camera.
const VIEWS: { label: string; dir: THREE.Vector3; up: THREE.Vector3 }[] = [
  { label: "FRONT", dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { label: "SIDE", dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { label: "TOP", dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  { label: "ISO", dir: new THREE.Vector3(1, 0.85, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
];

function makeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1014);

  const hemi = new THREE.HemisphereLight(0xeaf1ff, 0x3b4048, 1.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(5, 8, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd0ff, 1.1);
  fill.position.set(-6, 3, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(0, 5, -8);
  scene.add(rim);
  const amb = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(amb);

  const grid = new THREE.GridHelper(12, 12, 0x39414d, 0x23282f);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.6;
  grid.name = "__grid";
  scene.add(grid);

  const axes = new THREE.AxesHelper(2.5);
  axes.name = "__axes";
  scene.add(axes);

  return scene;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Viewport = forwardRef<ViewportHandle>(function Viewport(_props, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const capCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const compositeRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = makeScene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(6, 5, 7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Image-based lighting for even, legible PBR shading (clay-render feel).
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    controlsRef.current = controls;

    // Offscreen capture: render into a render target with the MAIN renderer and
    // read pixels back. Using the proven main context (not a second WebGL
    // context) is what makes the capture reliable across drivers/GPUs.
    const rt = new THREE.WebGLRenderTarget(CELL, CELL, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    rtRef.current = rt;
    const capCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 1000);
    capCameraRef.current = capCamera;
    const composite = document.createElement("canvas");
    composite.width = CELL * 2;
    composite.height = CELL * 2;
    compositeRef.current = composite;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      rt.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  const modelBox = (): THREE.Box3 => {
    const box = new THREE.Box3();
    const model = modelRef.current;
    if (model && model.children.length > 0) {
      box.setFromObject(model);
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    }
    return box;
  };

  useImperativeHandle(ref, (): ViewportHandle => ({
    setScene(graph) {
      const scene = sceneRef.current!;
      if (modelRef.current) {
        scene.remove(modelRef.current);
        modelRef.current.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
      }
      const group = buildSceneGroup(graph);
      modelRef.current = group;
      scene.add(group);
    },

    capture() {
      const scene = sceneRef.current!;
      const renderer = rendererRef.current!;
      const rt = rtRef.current!;
      const capCamera = capCameraRef.current!;
      const composite = compositeRef.current!;
      const ctx = composite.getContext("2d")!;

      const box = modelBox();
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const half = maxDim * 0.62; // ortho half-extent with margin
      const dist = maxDim * 3;

      const buffer = new Uint8Array(CELL * CELL * 4);
      const row = CELL * 4;

      ctx.fillStyle = "#0d1014";
      ctx.fillRect(0, 0, composite.width, composite.height);

      // Swap to a neutral mid-gray backdrop so both dark and light parts read
      // with high contrast in the image the model receives.
      const prevBg = scene.background;
      scene.background = new THREE.Color(0x6e757d);

      VIEWS.forEach((view, i) => {
        capCamera.left = -half;
        capCamera.right = half;
        capCamera.top = half;
        capCamera.bottom = -half;
        capCamera.near = 0.01;
        capCamera.far = dist * 4;
        capCamera.up.copy(view.up);
        capCamera.position.copy(center).addScaledVector(view.dir, dist);
        capCamera.lookAt(center);
        capCamera.updateProjectionMatrix();

        renderer.setRenderTarget(rt);
        renderer.render(scene, capCamera);
        renderer.readRenderTargetPixels(rt, 0, 0, CELL, CELL, buffer);

        // GL pixel rows are bottom-up; flip vertically into ImageData.
        const img = ctx.createImageData(CELL, CELL);
        for (let y = 0; y < CELL; y++) {
          const src = (CELL - 1 - y) * row;
          img.data.set(buffer.subarray(src, src + row), y * row);
        }
        const cx = (i % 2) * CELL;
        const cy = Math.floor(i / 2) * CELL;
        ctx.putImageData(img, cx, cy);

        // Label + cell border for clarity.
        ctx.strokeStyle = "#2b3340";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(cx + 8, cy + 8, 92, 30);
        ctx.fillStyle = "#cfe3ff";
        ctx.font = "bold 20px ui-monospace, monospace";
        ctx.fillText(view.label, cx + 16, cy + 30);
      });

      renderer.setRenderTarget(null);
      scene.background = prevBg;
      return composite.toDataURL("image/png");
    },

    exportGLB() {
      const model = modelRef.current;
      if (!model) return;
      new GLTFExporter().parse(
        model,
        (result) => {
          const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
          download(blob, "model.glb");
        },
        (err) => console.error("GLB export failed", err),
        { binary: true }
      );
    },

    exportOBJ() {
      const model = modelRef.current;
      if (!model) return;
      const text = new OBJExporter().parse(model);
      download(new Blob([text], { type: "text/plain" }), "model.obj");
    },

    fit() {
      const box = modelBox();
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const camera = cameraRef.current!;
      const controls = controlsRef.current!;
      const dir = new THREE.Vector3(1, 0.8, 1).normalize();
      camera.position.copy(center).addScaledVector(dir, maxDim * 2.4);
      controls.target.copy(center);
      controls.update();
    },
  }), []);

  return <div ref={mountRef} className="h-full w-full" />;
});

export default Viewport;
