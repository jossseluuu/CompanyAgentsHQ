import { poseAt, type Tile } from "@/office/pathAnimator";

const path: Tile[] = [
  [0, 0],
  [1, 0],
  [1, 1],
];

describe("poseAt", () => {
  it("interpola entre casillas", () => {
    const pose = poseAt({ path, startedAt: 0, secondsPerTile: 1 }, 500);
    expect(pose).toMatchObject({ x: 0.5, z: 0, walking: true });
  });

  it("gira en las esquinas", () => {
    const pose = poseAt({ path, startedAt: 0, secondsPerTile: 1 }, 1500);
    expect(pose).toMatchObject({ x: 1, z: 0.5 });
  });

  it("se detiene al final", () => {
    expect(poseAt({ path, startedAt: 0, secondsPerTile: 1 }, 9000)).toMatchObject({ x: 1, z: 1, walking: false });
  });

  it("no retrocede antes de empezar", () => {
    expect(poseAt({ path, startedAt: 1000, secondsPerTile: 1 }, 0)).toMatchObject({ x: 0, z: 0 });
  });

  it("sin velocidad salta al destino", () => {
    expect(poseAt({ path, startedAt: 0, secondsPerTile: 0 }, 0)).toMatchObject({ x: 1, z: 1, walking: false });
  });
});
