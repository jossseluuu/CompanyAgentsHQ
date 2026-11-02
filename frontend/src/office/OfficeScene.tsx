import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { useOffice } from "@/store/office";

import { AgentAvatar } from "./AgentAvatar";
import { poseAt } from "./pathAnimator";
import { Grounds } from "./Grounds";
import { RoomMesh } from "./RoomMesh";
import { t } from "@/shared/i18n";

const ZOOMS = [1, 1.5, 2.2];
const DISTANCE = 60;
const ELEVATION = THREE.MathUtils.degToRad(35);

/** El nivel base encuadra la oficina entera: crece con ella y no depende de los paneles abiertos. */
const fitZoom = (width: number, height: number, span: number) => Math.max(Math.min(width / (span * 0.76), height / (span * 0.5)), 8);

interface View {
  target: THREE.Vector3;
  turns: number;
  zoomLevel: number;
}

function CameraRig({ view, picker, span }: { view: MutableRefObject<View>; picker: MutableRefObject<ScreenToGrid | null>; span: number }) {
  const { camera, size } = useThree();
  const follow = useOffice((s) => s.followAgentId);
  const azimuth = useRef(Math.PI / 4);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  useEffect(() => {
    picker.current = (clientX, clientY, rect) => {
      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(ground, hit) ? [hit.x, hit.z] : null;
    };
  }, [camera, ground, picker, raycaster]);

  useFrame((_, delta) => {
    const state = useOffice.getState();
    if (follow) {
      const agent = state.agents[follow];
      const walk = state.walks[follow];
      if (agent) {
        const pose = walk ? poseAt(walk, performance.now()) : { x: agent.pos_x, z: agent.pos_y };
        view.current.target.lerp(new THREE.Vector3(pose.x, 0, pose.z), Math.min(delta * 4, 1));
      }
    }
    const wanted = Math.PI / 4 + (view.current.turns * Math.PI) / 2;
    azimuth.current += (wanted - azimuth.current) * Math.min(delta * 8, 1);
    const { target } = view.current;
    const flat = Math.cos(ELEVATION) * DISTANCE;
    camera.position.set(
      target.x + Math.sin(azimuth.current) * flat,
      target.y + Math.sin(ELEVATION) * DISTANCE,
      target.z + Math.cos(azimuth.current) * flat,
    );
    camera.lookAt(target);
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    const wantedZoom = ZOOMS[view.current.zoomLevel] * fitZoom(size.width, size.height, span);
    (camera as THREE.OrthographicCamera).zoom = zoom + (wantedZoom - zoom) * Math.min(delta * 8, 1);
    camera.updateProjectionMatrix();
  });

  return <OrthographicCamera makeDefault near={0.1} far={300} zoom={ZOOMS[0]} position={[60, 40, 60]} />;
}

export type ScreenToGrid = (x: number, y: number, rect: DOMRect) => [number, number] | null;

export function OfficeScene({ picker }: { picker: MutableRefObject<ScreenToGrid | null> }) {
  const snapshot = useOffice((s) => s.snapshot);
  const agents = useOffice((s) => s.agents);
  const highlight = useOffice((s) => s.highlightDepartment);
  const paused = useOffice((s) => s.paused);
  const center = snapshot ? new THREE.Vector3(snapshot.office.width / 2, 0, snapshot.office.height / 2) : new THREE.Vector3();
  const view = useRef<View>({ target: center, turns: 0, zoomLevel: 0 });
  const [, redraw] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const officeWidth = snapshot?.office.width ?? 0;
  const officeHeight = snapshot?.office.height ?? 0;
  const span = officeWidth + officeHeight || 60;
  useEffect(() => {
    view.current.target.set(officeWidth / 2, 0, officeHeight / 2);
  }, [officeWidth, officeHeight]);

  if (!snapshot) return null;
  const shadowReach = Math.max(snapshot.office.width, snapshot.office.height) * 0.75 + 14;
  const colorOf = (departmentId: string | null) =>
    snapshot.departments.find((d) => d.id === departmentId)?.color ?? "#64748b";
  const roomDimmed = (roomId: string) =>
    highlight !== null &&
    !Object.values(agents).some((a) => a.home_room_id === roomId && a.department_id === highlight);

  const pan = (dx: number, dy: number) => {
    const scale = 1 / (ZOOMS[view.current.zoomLevel] * fitZoom(window.innerWidth, window.innerHeight, span));
    const angle = Math.PI / 4 + (view.current.turns * Math.PI) / 2;
    const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    view.current.target.addScaledVector(right, -dx * scale);
    view.current.target.addScaledVector(forward, -dy * scale * 1.7);
    useOffice.getState().follow(null);
  };

  return (
    <div
      className="absolute inset-0"
      style={{ filter: paused ? "saturate(0.35) brightness(0.7)" : undefined }}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY };
        moved.current = false;
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const [dx, dy] = [event.clientX - drag.current.x, event.clientY - drag.current.y];
        if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
        pan(dx, dy);
        drag.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(event) => {
        const next = view.current.zoomLevel + (event.deltaY < 0 ? 1 : -1);
        view.current.zoomLevel = Math.min(Math.max(next, 0), ZOOMS.length - 1);
      }}
    >
      <Canvas shadows flat dpr={[1, 1.5]} gl={{ preserveDrawingBuffer: true, antialias: false }}>
        <color attach="background" args={["#7fc98b"]} />
        <hemisphereLight args={["#e0f2fe", "#86c98f", 1.5]} />
        <primitive object={sunTarget} position={[center.x, 0, center.z]} />
        <directionalLight
          position={[center.x + 22, 42, center.z + 12]}
          target={sunTarget}
          color="#fff1d6"
          intensity={2.1}
          castShadow
          shadow-mapSize={[1536, 1536]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        >
          <orthographicCamera attach="shadow-camera" args={[-shadowReach, shadowReach, shadowReach, -shadowReach, 1, 140]} />
        </directionalLight>
        <Grounds width={snapshot.office.width} height={snapshot.office.height} />
        {snapshot.office.rooms.map((room) => (
          <RoomMesh key={room.id} room={room} dimmed={roomDimmed(room.id)} />
        ))}
        {Object.values(agents).map((agent) => (
          <AgentAvatar key={agent.id} agent={agent} color={colorOf(agent.department_id)} />
        ))}
        <CameraRig view={view} picker={picker} span={span} />
      </Canvas>
      <div className="absolute bottom-3 left-3 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <SceneButton label={t("Girar a la izquierda")} onClick={() => (view.current.turns -= 1)}>⟲</SceneButton>
        <SceneButton label={t("Girar a la derecha")} onClick={() => (view.current.turns += 1)}>⟳</SceneButton>
        <SceneButton label={t("Acercar")} onClick={() => (view.current.zoomLevel = Math.min(view.current.zoomLevel + 1, 2))}>＋</SceneButton>
        <SceneButton label={t("Alejar")} onClick={() => (view.current.zoomLevel = Math.max(view.current.zoomLevel - 1, 0))}>－</SceneButton>
        <SceneButton
          label={t("Centrar")}
          onClick={() => {
            view.current.target.copy(center);
            useOffice.getState().follow(null);
            redraw((n) => n + 1);
          }}
        >
          ◎
        </SceneButton>
      </div>
    </div>
  );
}

function SceneButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="scene-button"
    >
      {children}
    </button>
  );
}
