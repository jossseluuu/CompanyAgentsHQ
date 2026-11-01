export type Tile = [number, number];

export interface Walk {
  path: Tile[];
  startedAt: number;
  secondsPerTile: number;
}

export interface Pose {
  x: number;
  z: number;
  walking: boolean;
  heading: number;
}

/** Posición interpolada en el cliente: el servidor solo envía la ruta (RNF-TRE-02). */
export function poseAt(walk: Walk, now: number): Pose {
  const { path, startedAt, secondsPerTile } = walk;
  const last = path[path.length - 1];
  if (path.length < 2 || secondsPerTile <= 0) return { x: last[0], z: last[1], walking: false, heading: 0 };
  const progress = (now - startedAt) / 1000 / secondsPerTile;
  if (progress >= path.length - 1) {
    const [a, b] = [path[path.length - 2], last];
    return { x: last[0], z: last[1], walking: false, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }
  const index = Math.max(Math.floor(progress), 0);
  const ratio = Math.max(progress, 0) - index;
  const [from, to] = [path[index], path[index + 1]];
  return {
    x: from[0] + (to[0] - from[0]) * ratio,
    z: from[1] + (to[1] - from[1]) * ratio,
    walking: true,
    heading: Math.atan2(to[0] - from[0], to[1] - from[1]),
  };
}
