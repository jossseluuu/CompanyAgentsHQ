import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type InstancedMesh, Matrix4 } from "three";

import type { Room } from "@/api/types";
import { useOffice } from "@/store/office";

import { Furniture } from "./Furniture";

const WALL_HEIGHT = 1.1;

function wallSegments(room: Room) {
  const doors = new Set(room.doors.map(([x, y]) => `${x},${y}`));
  const tiles: [number, number][] = [];
  const { grid_x: x, grid_y: y, width, height } = room;
  for (let i = 0; i < width; i += 1) tiles.push([x + i, y], [x + i, y + height - 1]);
  for (let j = 1; j < height - 1; j += 1) tiles.push([x, y + j], [x + width - 1, y + j]);
  return tiles.filter(([a, b]) => !doors.has(`${a},${b}`));
}

export function RoomMesh({ room, dimmed }: { room: Room; dimmed: boolean }) {
  const [hovered, setHovered] = useState(false);
  const openRoom = useOffice((s) => s.openRoom);
  const selected = useOffice((s) => s.selectedRoomId === room.id);
  const walls = useMemo(() => wallSegments(room), [room]);
  const wallMesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!wallMesh.current) return;
    const matrix = new Matrix4();
    walls.forEach(([x, z], index) => wallMesh.current!.setMatrixAt(index, matrix.setPosition(x, WALL_HEIGHT / 2, z)));
    wallMesh.current.instanceMatrix.needsUpdate = true;
    wallMesh.current.computeBoundingSphere();
  }, [walls]);
  const cx = room.grid_x + (room.width - 1) / 2;
  const cz = room.grid_y + (room.height - 1) / 2;
  const moduleKey = (id: string) => room.modules.find((m) => m.id === id)?.module_key;

  return (
    <group>
      <mesh
        position={[cx, 0.01, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          openRoom(room.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[room.width, room.height]} />
        <meshStandardMaterial
          color={room.color}
          emissive={selected || hovered ? "#6366f1" : "#000000"}
          emissiveIntensity={selected ? 0.35 : hovered ? 0.2 : 0}
          transparent={dimmed}
          opacity={dimmed ? 0.35 : 1}
        />
      </mesh>
      <instancedMesh ref={wallMesh} args={[undefined, undefined, walls.length]} castShadow>
        <boxGeometry args={[1, WALL_HEIGHT, 1]} />
        <meshStandardMaterial color={dimmed ? "#475569" : "#cbd5e1"} />
      </instancedMesh>
      {room.furniture.map((item) => {
        const key = moduleKey(item.room_module_id);
        return (
          <Furniture
            key={item.id}
            item={item}
            onSelect={item.interactive && key ? () => openRoom(room.id, key) : undefined}
          />
        );
      })}
      {(hovered || selected) && (
        <Html position={[cx, 2.2, cz]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-slate-900 px-2 py-0.5 text-sm text-white shadow">{room.name}</div>
        </Html>
      )}
    </group>
  );
}
