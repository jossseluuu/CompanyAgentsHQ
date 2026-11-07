import { useMemo } from "react";
import { BoxGeometry, type BufferGeometry, Color, Float32BufferAttribute, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { FurnitureItem } from "@/api/types";

import { buildParts, type Part } from "./furnitureModels";
import { span } from "./planRules";
import { speckleTexture } from "./pixelTextures";

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
function modelFor({ model_key, width, depth, variant }: FurnitureItem): Model {
  const key = `${model_key}:${width}x${depth}:${variant}`;
  const known = models.get(key);
  if (known) return known;
  const parts = buildParts(model_key, width, depth, variant);
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
  const model = useMemo(() => modelFor(item), [item]);
  const { solid, glow, picked: highlighted } = materials();
  const [across, deep] = span(item);
  return (
    <group
      position={[item.grid_x + (across - 1) / 2, 0, item.grid_y + (deep - 1) / 2]}
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
