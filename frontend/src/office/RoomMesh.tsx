import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type InstancedMesh, Matrix4 } from "three";

import type { Room } from "@/api/types";
import { useOffice } from "@/store/office";

import { Furniture } from "./Furniture";
import { brickTexture, carpetTexture, tiled, tileTexture, woodTexture } from "./pixelTextures";

const WALL_HEIGHT = 0.9;
const CAP_HEIGHT = 0.1;
const FLOORS: Record<string, () => ReturnType<typeof tileTexture>> = {
  "sala-descanso": woodTexture,
  "sala-juntas": carpetTexture,
  "despacho-ceo": carpetTexture,
  marketing: woodTexture,
};

function wallSegments(room: Room) {
  const doors = new Set(room.doors.map(([x, y]) => `${x},${y}`));
  const tiles: [number, number][] = [];
  const { grid_x: x, grid_y: y, width, height } = room;
  for (let i = 0; i < width; i += 1) tiles.push([x + i, y], [x + i, y + height - 1]);
  for (let j = 1; j < height - 1; j += 1) tiles.push([x, y + j], [x + width - 1, y + j]);
  return tiles.filter(([a, b]) => !doors.has(`${a},${b}`));
}

function fillRow(mesh: InstancedMesh | null, walls: [number, number][], y: number) {
  if (!mesh) return;
  const matrix = new Matrix4();
  walls.forEach(([x, z], index) => mesh.setMatrixAt(index, matrix.setPosition(x, y, z)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function RoomMesh({ room, dimmed }: { room: Room; dimmed: boolean }) {
  const [hovered, setHovered] = useState(false);
  const openRoom = useOffice((s) => s.openRoom);
  const selected = useOffice((s) => s.selectedRoomId === room.id || s.editRoomId === room.id);
  const editing = useOffice((s) => s.editing);
  const pickedFurniture = useOffice((s) => s.editFurnitureId);
  const walls = useMemo(() => wallSegments(room), [room]);
  const wallMesh = useRef<InstancedMesh>(null);
  const capMesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    fillRow(wallMesh.current, walls, WALL_HEIGHT / 2);
    fillRow(capMesh.current, walls, WALL_HEIGHT + CAP_HEIGHT / 2);
  }, [walls]);
  const floor = useMemo(
    () => tiled((FLOORS[room.slug] ?? tileTexture)(), room.width, room.height),
    [room.slug, room.width, room.height],
  );
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
          const office = useOffice.getState();
          if (!editing) openRoom(room.id);
          else if (pickedFurniture) void office.placeFurniture(Math.round(event.point.x), Math.round(event.point.z));
          else office.editSelect(room.id);
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
          map={floor}
          roughness={0.9}
          emissive={selected || hovered ? "#818cf8" : "#000000"}
          emissiveIntensity={selected ? 0.35 : hovered ? 0.18 : 0}
          transparent={dimmed}
          opacity={dimmed ? 0.35 : 1}
        />
      </mesh>
      <instancedMesh ref={wallMesh} args={[undefined, undefined, walls.length]} castShadow receiveShadow>
        <boxGeometry args={[1, WALL_HEIGHT, 1]} />
        <meshStandardMaterial color={dimmed ? "#64748b" : "#ffffff"} map={brickTexture()} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={capMesh} args={[undefined, undefined, walls.length]} castShadow>
        <boxGeometry args={[1, CAP_HEIGHT, 1]} />
        <meshStandardMaterial color={selected ? "#818cf8" : room.color} roughness={0.7} />
      </instancedMesh>
      {room.doors.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color="#7c4a21" map={woodTexture()} />
        </mesh>
      ))}
      {room.furniture.map((item) => {
        const key = moduleKey(item.room_module_id);
        return (
          <Furniture
            key={item.id}
            item={item}
            picked={pickedFurniture === item.id}
            onSelect={
              editing
                ? () => {
                    useOffice.getState().editSelect(room.id);
                    useOffice.getState().editPick(item.id);
                  }
                : item.interactive && key
                  ? () => openRoom(room.id, key)
                  : undefined
            }
          />
        );
      })}
      <Html position={[room.grid_x + 1, 1.7, room.grid_y + 1]} center zIndexRange={[12, 0]} style={{ pointerEvents: "none" }}>
        <div className={`room-sign ${hovered || selected ? "room-sign-active" : ""}`} style={{ borderColor: room.color }}>
          {room.name}
        </div>
      </Html>
    </group>
  );
}
