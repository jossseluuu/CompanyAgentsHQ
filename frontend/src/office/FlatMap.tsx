import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

/** Vista cenital en SVG: minimapa y alternativa para equipos sin WebGL (RF-OFI-11, RF-OFI-13). */
export function FlatMap({ className = "" }: { className?: string }) {
  const snapshot = useOffice((s) => s.snapshot);
  const agents = useOffice((s) => s.agents);
  const openRoom = useOffice((s) => s.openRoom);
  const openAgent = useOffice((s) => s.openAgent);
  if (!snapshot) return null;
  const { width, height, rooms } = snapshot.office;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={t("Plano de la oficina")}>
      {rooms.map((room) => (
        <g key={room.id} onClick={() => openRoom(room.id)} className="cursor-pointer">
          <rect x={room.grid_x} y={room.grid_y} width={room.width} height={room.height} fill={room.color} stroke="#334155" strokeWidth={0.2} />
          <text x={room.grid_x + 0.6} y={room.grid_y + 1.6} fontSize={1} fill="#0f172a">
            {room.name}
          </text>
        </g>
      ))}
      {Object.values(agents).map((agent) => (
        <circle
          key={agent.id}
          cx={agent.pos_x + 0.5}
          cy={agent.pos_y + 0.5}
          r={0.6}
          fill="#1e293b"
          className="cursor-pointer"
          onClick={() => openAgent(agent.id)}
        >
          <title>{agent.name}</title>
        </circle>
      ))}
    </svg>
  );
}

export function hasWebGL() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
