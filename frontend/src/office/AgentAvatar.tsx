import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";

import type { Agent } from "@/api/types";
import { useOffice } from "@/store/office";

import { poseAt } from "./pathAnimator";
import { STATUS } from "./status";

const PROBLEMS = new Set(["error", "waiting_approval", "paused", "flagged"]);

export function AgentAvatar({ agent, color }: { agent: Agent; color: string }) {
  const body = useRef<Group>(null);
  const legL = useRef<Mesh>(null);
  const legR = useRef<Mesh>(null);
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

  useFrame(() => {
    if (!body.current) return;
    const now = performance.now();
    const pose = walk ? poseAt(walk, now) : { x: agent.pos_x, z: agent.pos_y, walking: false, heading: 0 };
    body.current.position.set(pose.x, 0, pose.z);
    if (pose.walking) body.current.rotation.y = pose.heading;
    const swing = pose.walking ? Math.sin(now / 90) * 0.6 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    const seated = !pose.walking && agent.status === "resting";
    body.current.scale.y = seated ? 0.8 : 1;
  });

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
      <mesh ref={legL} position={[-0.11, 0.2, 0]} castShadow>
        <boxGeometry args={[0.13, 0.4, 0.15]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh ref={legR} position={[0.11, 0.2, 0]} castShadow>
        <boxGeometry args={[0.13, 0.4, 0.15]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.42, 0.48, 0.26]} />
        <meshStandardMaterial color={color} transparent={dimmed} opacity={dimmed ? 0.3 : 1} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#fcd9b6" transparent={dimmed} opacity={dimmed ? 0.3 : 1} />
      </mesh>
      <Html position={[0, 1.55, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-0.5" style={{ opacity: dimmed ? 0.3 : 1 }}>
          {bubble && (
            <div className="w-44 rounded bg-white px-1.5 py-0.5 text-center text-xs text-slate-900 shadow">{bubble.text}</div>
          )}
          <div className={`whitespace-nowrap rounded px-1 text-[11px] leading-4 ${info.tone}`} title={info.label}>
            <span aria-hidden>{info.icon}</span> {agent.name}
          </div>
        </div>
      </Html>
    </group>
  );
}
