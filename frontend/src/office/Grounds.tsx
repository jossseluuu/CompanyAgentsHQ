import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, Matrix4 } from "three";

import { grassTexture, stoneTexture, tiled } from "./pixelTextures";

const GROUND = 300;
const LEAVES = ["#15803d", "#16a34a", "#22c55e", "#166534"];
const TREES_PER_SIDE = 16;

type Tree = [x: number, z: number, scale: number];

/** Posiciones deterministas: el jardín es el mismo en cada carga y rodea la oficina sin tocarla. */
function plantTrees(width: number, height: number): Tree[] {
  const trees: Tree[] = [];
  const jitter = (n: number) => ((n * 2654435761) % 1000) / 1000;
  for (let i = 0; i < TREES_PER_SIDE; i += 1) {
    const along = (i + 0.5) / TREES_PER_SIDE;
    const step = i * 7 + 3;
    const scale = 0.8 + jitter(step) * 0.7;
    trees.push(
      [-6 - jitter(step) * 6, along * (height + 12) - 6, scale],
      [width + 6 + jitter(step + 1) * 6, along * (height + 12) - 6, scale],
      [along * (width + 12) - 6, -6 - jitter(step + 2) * 6, scale],
      [along * (width + 12) - 6, height + 6 + jitter(step + 3) * 6, scale],
    );
  }
  return trees;
}

function Trees({ width, height }: { width: number; height: number }) {
  const trees = useMemo(() => plantTrees(width, height), [width, height]);
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!trunks.current || !crowns.current) return;
    const matrix = new Matrix4();
    const scale = new Matrix4();
    const color = new Color();
    trees.forEach(([x, z, size], index) => {
      trunks.current!.setMatrixAt(index, matrix.makeScale(size, size, size).setPosition(x, 0.75 * size, z));
      crowns.current!.setMatrixAt(index, scale.makeScale(size, size, size).setPosition(x, 2.3 * size, z));
      crowns.current!.setColorAt(index, color.set(LEAVES[index % LEAVES.length]));
    });
    trunks.current.instanceMatrix.needsUpdate = true;
    crowns.current.instanceMatrix.needsUpdate = true;
    if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
    trunks.current.computeBoundingSphere();
    crowns.current.computeBoundingSphere();
  }, [trees]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow>
        <boxGeometry args={[0.45, 1.5, 0.45]} />
        <meshStandardMaterial color="#7c4a21" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, trees.length]} castShadow>
        <boxGeometry args={[2.1, 1.9, 2.1]} />
        <meshStandardMaterial color="#ffffff" />
      </instancedMesh>
    </>
  );
}

/** Césped, plaza de piedra bajo la oficina y árboles alrededor. */
export function Grounds({ width, height }: { width: number; height: number }) {
  const grass = useMemo(() => tiled(grassTexture(), GROUND / 3, GROUND / 3), []);
  const stone = useMemo(() => tiled(stoneTexture(), (width + 3) / 2, (height + 3) / 2), [width, height]);
  return (
    <>
      <mesh position={[width / 2, -0.03, height / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND, GROUND]} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>
      <mesh position={[width / 2 - 0.5, -0.01, height / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 3, height + 3]} />
        <meshStandardMaterial map={stone} roughness={1} />
      </mesh>
      <Trees width={width} height={height} />
    </>
  );
}
