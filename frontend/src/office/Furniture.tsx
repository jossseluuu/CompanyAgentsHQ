import { useMemo } from "react";
import { BoxGeometry, type BufferGeometry, Color, Float32BufferAttribute, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { FurnitureItem } from "@/api/types";

import { speckleTexture } from "./pixelTextures";

type Part = [w: number, h: number, d: number, y: number, color: string, x?: number, z?: number, glow?: boolean];

const WOOD = "#b7793a";
const WOOD_DARK = "#7c4a21";
const METAL = "#64748b";
const INK = "#1e293b";

const shelf = (y: number, colors: string[]): Part[] =>
  colors.map((color, index) => [0.14, 0.2, 0.22, y, color, -0.27 + index * 0.18, 0.08]);

/** Muebles de bloques con textura pixelada; sustituibles por glTF sin tocar la escena. */
const MODELS: Record<string, Part[]> = {
  desk: [
    [0.92, 0.07, 0.6, 0.46, WOOD],
    [0.07, 0.42, 0.07, 0.21, WOOD_DARK, -0.4, -0.23],
    [0.07, 0.42, 0.07, 0.21, WOOD_DARK, 0.4, -0.23],
    [0.07, 0.42, 0.07, 0.21, WOOD_DARK, -0.4, 0.23],
    [0.07, 0.42, 0.07, 0.21, WOOD_DARK, 0.4, 0.23],
    [0.46, 0.3, 0.04, 0.72, INK, 0, -0.14],
    [0.4, 0.24, 0.02, 0.72, "#38bdf8", 0, -0.115, true],
    [0.08, 0.1, 0.06, 0.54, METAL, 0, -0.14],
    [0.3, 0.02, 0.12, 0.51, "#e2e8f0", 0, 0.1],
    [0.1, 0.09, 0.1, 0.545, "#f87171", 0.32, 0.12],
  ],
  filing_cabinet: [
    [0.7, 1.1, 0.5, 0.55, METAL],
    [0.62, 0.3, 0.02, 0.92, "#94a3b8", 0, 0.26],
    [0.62, 0.3, 0.02, 0.58, "#94a3b8", 0, 0.26],
    [0.62, 0.3, 0.02, 0.24, "#94a3b8", 0, 0.26],
    [0.16, 0.03, 0.03, 0.92, "#e2e8f0", 0, 0.28],
    [0.16, 0.03, 0.03, 0.58, "#e2e8f0", 0, 0.28],
    [0.16, 0.03, 0.03, 0.24, "#e2e8f0", 0, 0.28],
  ],
  board: [
    [0.94, 0.68, 0.05, 0.86, "#fbbf24"],
    [0.84, 0.58, 0.02, 0.86, "#fef3c7", 0, 0.03],
    [0.2, 0.2, 0.02, 0.94, "#f472b6", -0.2, 0.05],
    [0.2, 0.2, 0.02, 0.76, "#60a5fa", 0.2, 0.05],
    [0.06, 0.52, 0.06, 0.26, "#78716c", -0.3],
    [0.06, 0.52, 0.06, 0.26, "#78716c", 0.3],
  ],
  bookshelf: [
    [0.85, 1.28, 0.34, 0.64, WOOD_DARK],
    [0.74, 0.03, 0.3, 0.42, WOOD, 0, 0.03],
    [0.74, 0.03, 0.3, 0.84, WOOD, 0, 0.03],
    ...shelf(0.22, ["#2563eb", "#dc2626", "#16a34a", "#f59e0b"]),
    ...shelf(0.56, ["#7c3aed", "#0ea5e9", "#ef4444", "#22c55e"]),
    ...shelf(0.98, ["#f97316", "#14b8a6", "#6366f1", "#ec4899"]),
  ],
  screen: [
    [1, 0.62, 0.07, 1, INK],
    [0.9, 0.52, 0.02, 1, "#22d3ee", 0, 0.045, true],
    [0.5, 0.05, 0.02, 1.1, "#ecfeff", -0.1, 0.06, true],
    [0.3, 0.05, 0.02, 0.96, "#ecfeff", -0.2, 0.06, true],
    [0.1, 0.68, 0.1, 0.34, METAL],
    [0.5, 0.05, 0.3, 0.03, METAL],
  ],
  sofa: [
    [0.96, 0.24, 0.6, 0.2, "#c2410c"],
    [0.96, 0.42, 0.16, 0.42, "#9a3412", 0, -0.24],
    [0.14, 0.32, 0.6, 0.34, "#9a3412", -0.44],
    [0.14, 0.32, 0.6, 0.34, "#9a3412", 0.44],
    [0.36, 0.1, 0.4, 0.36, "#ea580c", -0.18, 0.04],
    [0.36, 0.1, 0.4, 0.36, "#ea580c", 0.18, 0.04],
  ],
  coffee_machine: [
    [0.7, 0.5, 0.5, 0.25, WOOD_DARK],
    [0.46, 0.5, 0.38, 0.75, "#475569"],
    [0.3, 0.14, 0.03, 0.86, "#fbbf24", 0, 0.2, true],
    [0.1, 0.1, 0.1, 0.55, "#f8fafc", 0, 0.1],
  ],
  plant: [
    [0.32, 0.26, 0.32, 0.13, "#c2703d"],
    [0.36, 0.04, 0.36, 0.27, "#9a5128"],
    [0.1, 0.24, 0.1, 0.38, "#4d7c0f"],
    [0.5, 0.26, 0.5, 0.56, "#16a34a"],
    [0.36, 0.22, 0.36, 0.78, "#22c55e"],
    [0.2, 0.16, 0.2, 0.96, "#4ade80"],
  ],
  meeting_table: [
    [2.4, 0.1, 1.2, 0.5, "#57534e"],
    [2.2, 0.02, 1, 0.56, "#78716c"],
    [0.5, 0.45, 0.5, 0.23, "#44403c"],
    [0.3, 0.3, 0.3, 0.2, "#475569", -0.8, 0.85],
    [0.3, 0.3, 0.3, 0.2, "#475569", 0, 0.85],
    [0.3, 0.3, 0.3, 0.2, "#475569", 0.8, 0.85],
    [0.3, 0.3, 0.3, 0.2, "#475569", -0.8, -0.85],
    [0.3, 0.3, 0.3, 0.2, "#475569", 0, -0.85],
    [0.3, 0.3, 0.3, 0.2, "#475569", 0.8, -0.85],
  ],
  whiteboard: [
    [0.98, 0.7, 0.05, 0.86, "#cbd5e1"],
    [0.88, 0.6, 0.02, 0.86, "#f8fafc", 0, 0.03],
    [0.5, 0.04, 0.02, 1, "#2563eb", -0.1, 0.05],
    [0.34, 0.04, 0.02, 0.9, "#dc2626", -0.18, 0.05],
    [0.06, 0.52, 0.06, 0.26, "#94a3b8", -0.3],
    [0.06, 0.52, 0.06, 0.26, "#94a3b8", 0.3],
  ],
  inbox: [
    [0.56, 0.52, 0.42, 0.26, "#475569"],
    [0.62, 0.14, 0.46, 0.6, "#6366f1"],
    [0.5, 0.05, 0.36, 0.69, "#f8fafc"],
    [0.1, 0.1, 0.02, 0.32, "#fbbf24", 0, 0.22, true],
  ],
  lamp: [
    [0.3, 0.05, 0.3, 0.03, INK],
    [0.05, 1.2, 0.05, 0.62, INK],
    [0.36, 0.26, 0.36, 1.32, "#fde68a", 0, 0, true],
  ],
  rug: [
    [0.96, 0.03, 0.96, 0.03, "#be185d"],
    [0.76, 0.035, 0.76, 0.035, "#f9a8d4"],
    [0.5, 0.04, 0.5, 0.04, "#be185d"],
  ],
  water_cooler: [
    [0.4, 0.66, 0.4, 0.33, "#e2e8f0"],
    [0.32, 0.4, 0.32, 0.86, "#7dd3fc", 0, 0, true],
    [0.12, 0.06, 0.03, 0.5, "#2563eb", 0, 0.21],
  ],
  printer: [
    [0.7, 0.42, 0.5, 0.21, "#475569"],
    [0.62, 0.2, 0.46, 0.52, "#cbd5e1"],
    [0.4, 0.02, 0.3, 0.63, "#f8fafc"],
    [0.1, 0.05, 0.02, 0.52, "#22c55e", 0.2, 0.24, true],
  ],
};

function merged(parts: Part[]): BufferGeometry | null {
  if (!parts.length) return null;
  const color = new Color();
  const boxes = parts.map(([w, h, d, y, tint, x = 0, z = 0]) => {
    const box = new BoxGeometry(w, h, d).translate(x, y, z);
    color.set(tint);
    const vertices = box.getAttribute("position").count;
    box.setAttribute("color", new Float32BufferAttribute(Array.from({ length: vertices }, () => [color.r, color.g, color.b]).flat(), 3));
    return box;
  });
  return mergeGeometries(boxes);
}

interface Model {
  solid: BufferGeometry | null;
  glow: BufferGeometry | null;
}

const models = new Map<string, Model>();

/** Cada modelo es una sola malla con color por vértice: un mueble son dos llamadas de dibujo como mucho. */
function modelFor(key: string): Model {
  const known = models.get(key);
  if (known) return known;
  const parts = MODELS[key] ?? MODELS.board;
  const model = { solid: merged(parts.filter((p) => !p[7])), glow: merged(parts.filter((p) => p[7])) };
  models.set(key, model);
  return model;
}

let shared: { solid: MeshStandardMaterial; picked: MeshStandardMaterial; glow: MeshBasicMaterial } | null = null;

function materials() {
  shared ??= {
    solid: new MeshStandardMaterial({ vertexColors: true, map: speckleTexture(), roughness: 0.85 }),
    picked: new MeshStandardMaterial({ vertexColors: true, map: speckleTexture(), emissive: "#6366f1", emissiveIntensity: 0.8 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return shared;
}

export function Furniture({ item, onSelect, picked = false }: { item: FurnitureItem; onSelect?: () => void; picked?: boolean }) {
  const model = useMemo(() => modelFor(item.model_key), [item.model_key]);
  const { solid, glow, picked: highlighted } = materials();
  return (
    <group
      position={[item.grid_x, 0, item.grid_y]}
      rotation={[0, (item.rotation * Math.PI) / 180, 0]}
      onClick={(event) => {
        if (!onSelect) return;
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={(event) => {
        if (onSelect) {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {model.solid && <mesh geometry={model.solid} material={picked ? highlighted : solid} castShadow receiveShadow />}
      {model.glow && <mesh geometry={model.glow} material={glow} />}
    </group>
  );
}
