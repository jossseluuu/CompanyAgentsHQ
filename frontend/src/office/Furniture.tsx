import type { FurnitureItem } from "@/api/types";

import { speckleTexture } from "./pixelTextures";

type Part = [w: number, h: number, d: number, y: number, color: string, x?: number, z?: number];

/** Muebles de bloques con textura pixelada; sustituibles por glTF sin tocar la escena. */
const MODELS: Record<string, Part[]> = {
  desk: [
    [0.9, 0.08, 0.6, 0.45, "#a16207"],
    [0.08, 0.42, 0.5, 0.21, "#713f12", -0.38],
    [0.08, 0.42, 0.5, 0.21, "#713f12", 0.38],
    [0.4, 0.26, 0.04, 0.65, "#1e293b", 0, -0.15],
  ],
  filing_cabinet: [
    [0.7, 1.1, 0.5, 0.55, "#64748b"],
    [0.6, 0.02, 0.02, 0.8, "#cbd5e1", 0, 0.26],
    [0.6, 0.02, 0.02, 0.5, "#cbd5e1", 0, 0.26],
  ],
  board: [
    [0.9, 0.7, 0.06, 0.8, "#fef3c7"],
    [0.06, 0.5, 0.06, 0.25, "#78716c"],
  ],
  bookshelf: [
    [0.85, 1.25, 0.35, 0.62, "#92400e"],
    [0.7, 0.2, 0.3, 0.9, "#2563eb", 0, 0.05],
    [0.7, 0.2, 0.3, 0.45, "#dc2626", 0, 0.05],
  ],
  screen: [
    [0.95, 0.6, 0.06, 0.95, "#0ea5e9"],
    [0.1, 0.65, 0.1, 0.33, "#334155"],
  ],
  sofa: [
    [0.95, 0.3, 0.6, 0.2, "#b45309"],
    [0.95, 0.35, 0.15, 0.45, "#92400e", 0, -0.25],
  ],
  coffee_machine: [
    [0.5, 0.75, 0.45, 0.38, "#475569"],
    [0.3, 0.2, 0.05, 0.5, "#f59e0b", 0, 0.24],
  ],
  plant: [
    [0.3, 0.3, 0.3, 0.15, "#a8a29e"],
    [0.5, 0.6, 0.5, 0.6, "#16a34a"],
  ],
  meeting_table: [
    [2.4, 0.1, 1.2, 0.5, "#57534e"],
    [0.5, 0.45, 0.5, 0.23, "#44403c"],
  ],
  whiteboard: [
    [0.95, 0.7, 0.05, 0.85, "#f8fafc"],
    [0.06, 0.5, 0.06, 0.25, "#94a3b8"],
  ],
  inbox: [
    [0.6, 0.3, 0.45, 0.7, "#6366f1"],
    [0.5, 0.55, 0.4, 0.27, "#475569"],
  ],
};

export function Furniture({ item, onSelect, picked = false }: { item: FurnitureItem; onSelect?: () => void; picked?: boolean }) {
  const parts = MODELS[item.model_key] ?? MODELS.board;
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
      {parts.map(([w, h, d, y, color, x = 0, z = 0], index) => (
        <mesh key={index} position={[x, y, z]} castShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} map={speckleTexture()} emissive={picked ? "#6366f1" : "#000000"} emissiveIntensity={picked ? 0.8 : 0} />
        </mesh>
      ))}
    </group>
  );
}
