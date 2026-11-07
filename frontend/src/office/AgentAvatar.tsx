import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";

import type { Agent } from "@/api/types";
import { useOffice } from "@/store/office";

import { poseAt } from "./pathAnimator";
import { faceTexture, hairSideTexture, hairTexture, lookFor, shirtTexture, speckleTexture } from "./pixelTextures";
import { STATUS } from "./status";

/** Marca en el suelo; el estado también va en texto e icono (RNF-USA-03). */
const RING: Partial<Record<string, string>> = {
  thinking: "#818cf8",
  working: "#38bdf8",
  reviewing: "#a78bfa",
  meeting: "#e879f9",
  waiting_approval: "#facc15",
  flagged: "#fb923c",
  error: "#ef4444",
  paused: "#94a3b8",
};

const PROBLEMS = new Set(["error", "waiting_approval", "paused", "flagged"]);

export function AgentAvatar({ agent, color }: { agent: Agent; color: string }) {
  const body = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const openAgent = useOffice((s) => s.openAgent);
  const walk = useOffice((s) => s.walks[agent.id]);
  const flagged = useOffice((s) => s.flagged[agent.id]);
  const bubble = useOffice((s) => s.bubbles[agent.id]);
  const dimmed = useOffice(
    (s) =>
      (s.problemsOnly && !PROBLEMS.has(agent.status) && !s.flagged[agent.id]) ||
      (s.highlightDepartment !== null && s.highlightDepartment !== agent.department_id),
  );
  const lastClick = useRef(0);
  const phase = useMemo(() => agent.id.charCodeAt(0) + agent.id.charCodeAt(1), [agent.id]);

  const facing = useRef(0);

  useFrame((_, delta) => {
    if (!body.current) return;
    const now = performance.now();
    const pose = walk ? poseAt(walk, now) : { x: agent.pos_x, z: agent.pos_y, walking: false, heading: 0 };
    const hop = pose.walking ? Math.abs(Math.sin(now / 90)) * 0.07 : Math.sin(now / 500 + phase) * 0.012;
    body.current.position.set(pose.x, Math.max(hop, 0), pose.z);
    const seated_at_desk = !pose.walking && agent.pos_x === agent.seat_x && agent.pos_y === agent.seat_y;
    const wanted = seated_at_desk ? Math.PI : pose.heading;
    const turn = Math.atan2(Math.sin(wanted - facing.current), Math.cos(wanted - facing.current));
    facing.current += turn * Math.min(delta * 12, 1);
    body.current.rotation.y = facing.current;
    const swing = pose.walking ? Math.sin(now / 90) * 0.6 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing - (!pose.walking && agent.status === "working" ? Math.cos(now / 70) * 0.18 + 0.9 : 0);
    const typing = !pose.walking && agent.status === "working" ? Math.sin(now / 70) * 0.18 - 0.9 : 0;
    if (armR.current) armR.current.rotation.x = swing + typing;
    const seated = !pose.walking && agent.status === "resting";
    body.current.scale.y = seated ? 0.8 : 1;
  });

  const look = lookFor(agent.id);
  const ring = RING[flagged ? "flagged" : agent.status];
  const fade = { transparent: dimmed, opacity: dimmed ? 0.3 : 1 };
  const info = STATUS[flagged && agent.status !== "paused" ? "flagged" : agent.status];
  return (
    <group
      ref={body}
      position={[agent.pos_x, 0, agent.pos_y]}
      onClick={(event) => {
        event.stopPropagation();
        const now = performance.now();
        if (now - lastClick.current < 300) openAgent(agent.id, "chat");
        else openAgent(agent.id);
        lastClick.current = now;
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {ring && (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.36, 0.46, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color={ring} toneMapped={false} />
        </mesh>
      )}
      <group ref={legL} position={[-0.1, 0.4, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.18, 0.4, 0.2]} />
          <meshStandardMaterial color="#334155" map={speckleTexture()} {...fade} />
        </mesh>
      </group>
      <group ref={legR} position={[0.1, 0.4, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.18, 0.4, 0.2]} />
          <meshStandardMaterial color="#334155" map={speckleTexture()} {...fade} />
        </mesh>
      </group>
      <mesh position={[0, 0.64, 0]} castShadow>
        <boxGeometry args={[0.42, 0.48, 0.22]} />
        <meshStandardMaterial map={shirtTexture(color)} {...fade} />
      </mesh>
      <group ref={armL} position={[-0.3, 0.86, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.16, 0.48, 0.18]} />
          <meshStandardMaterial map={shirtTexture(color)} {...fade} />
        </mesh>
      </group>
      <group ref={armR} position={[0.3, 0.86, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.16, 0.48, 0.18]} />
          <meshStandardMaterial map={shirtTexture(color)} {...fade} />
        </mesh>
      </group>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.44, 0.44, 0.44]} />
        <meshStandardMaterial attach="material-0" map={hairSideTexture(look)} {...fade} />
        <meshStandardMaterial attach="material-1" map={hairSideTexture(look)} {...fade} />
        <meshStandardMaterial attach="material-2" map={hairTexture(look)} {...fade} />
        <meshStandardMaterial attach="material-3" color={look.skin} {...fade} />
        <meshStandardMaterial attach="material-4" map={faceTexture(look)} {...fade} />
        <meshStandardMaterial attach="material-5" map={hairTexture(look)} {...fade} />
      </mesh>
      <Html position={[0, 1.65, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-0.5" style={{ opacity: dimmed ? 0.3 : 1 }}>
          {bubble && (
            <div className="speech-bubble">{bubble.text}</div>
          )}
          <div className={`agent-tag ${info.tone}`} title={info.label}>
            <span aria-hidden>{info.icon}</span> {agent.name}
          </div>
        </div>
      </Html>
    </group>
  );
}
