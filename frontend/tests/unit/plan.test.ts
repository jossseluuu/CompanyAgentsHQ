import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Agent, Room } from "@/api/types";
import { buildParts, hasModel, STYLE_PALETTES } from "@/office/furnitureModels";
import { FURNITURE_LABELS } from "@/office/PlanEditor";
import { contentFits, furnitureFits, isWall, roomFits, seatFits, span, tilesOf, turned } from "@/office/planRules";

const room = {
  id: "r", grid_x: 2, grid_y: 2, width: 8, height: 6, doors: [[5, 2]],
  furniture: [{ id: "f", model_key: "desk", grid_x: 4, grid_y: 5, width: 2, depth: 1, rotation: 0 }],
} as unknown as Room;
const agents = [{ id: "a", home_room_id: "r", seat_x: 7, seat_y: 5 }] as unknown as Agent[];
const shape = (grid_x: number, grid_y: number, width = 1, depth = 1, rotation = 0) => ({ grid_x, grid_y, width, depth, rotation });

describe("huella de los muebles", () => {
  it("girar 90° cruza ancho y fondo", () => {
    expect(span({ width: 3, depth: 1, rotation: 90 })).toEqual([1, 3]);
    expect(tilesOf(shape(1, 1, 3, 1))).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(tilesOf(shape(1, 1, 3, 1, 90))).toEqual([[1, 1], [1, 2], [1, 3]]);
  });

  it("gira desde su centro y cuatro giros lo dejan donde estaba", () => {
    expect(turned(shape(14, 25, 3, 1))).toEqual({ rotation: 90, grid_x: 15, grid_y: 24 });
    for (const [width, depth] of [[3, 1], [2, 1], [5, 3], [1, 1]]) {
      let current = shape(10, 10, width, depth);
      for (let i = 0; i < 4; i += 1) current = { ...current, ...turned(current) };
      expect(current).toEqual(shape(10, 10, width, depth));
    }
  });

  it("cabe solo en suelo libre, lejos de puertas, muebles y puestos", () => {
    expect(furnitureFits(room, agents, shape(3, 6, 3, 1))).toBe(true);
    expect(furnitureFits(room, agents, shape(7, 6, 3, 1))).toBe(false);
    expect(furnitureFits(room, agents, shape(3, 5, 2, 1))).toBe(false);
    expect(furnitureFits(room, agents, shape(4, 5, 2, 1), "f")).toBe(true);
    expect(furnitureFits(room, agents, shape(5, 3))).toBe(false);
    expect(furnitureFits(room, agents, shape(6, 5, 2, 1))).toBe(false);
  });

  it("el puesto evita muebles y a los compañeros, pero no a sí mismo", () => {
    expect(seatFits(room, agents, [7, 5], "a")).toBe(true);
    expect(seatFits(room, agents, [7, 5], "b")).toBe(false);
    expect(seatFits(room, agents, [4, 5], "a")).toBe(false);
  });
});

describe("salas y puertas", () => {
  it("las esquinas no admiten puerta", () => {
    expect(isWall(room, [2, 2])).toBe(false);
    expect(isWall(room, [3, 2])).toBe(true);
    expect(isWall(room, [4, 4])).toBe(false);
  });

  it("detecta solapes y contenido que se quedaría fuera", () => {
    expect(roomFits([room], { grid_x: 9, grid_y: 2, width: 4, height: 4 })).toBe(false);
    expect(roomFits([room], { grid_x: 10, grid_y: 2, width: 4, height: 4 })).toBe(true);
    expect(roomFits([room], { grid_x: 3, grid_y: 3, width: 8, height: 6 }, "r")).toBe(true);
    expect(contentFits(room, agents, { grid_x: 2, grid_y: 2, width: 6, height: 6 })).toBe(false);
    expect(contentFits(room, agents, { grid_x: 12, grid_y: 2, width: 8, height: 6 })).toBe(true);
  });
});

describe("modelos", () => {
  it("cada tamaño queda dentro de su huella", () => {
    const sizes: [string, number, number][] = [["desk", 3, 1], ["filing_cabinet", 2, 1], ["sofa", 3, 1], ["meeting_table", 5, 3], ["rug", 3, 3], ["screen", 3, 1], ["whiteboard", 2, 1], ["bookshelf", 3, 1]];
    for (const [key, width, depth] of sizes) {
      for (const [w, , d, , , x = 0, z = 0] of buildParts(key, width, depth, "classic")) {
        expect(Math.abs(x) + w / 2).toBeLessThanOrEqual(width / 2 + 0.01);
        expect(Math.abs(z) + d / 2).toBeLessThanOrEqual(depth / 2 + 0.01);
      }
    }
  });

  it("cada mueble del catálogo tiene modelo y nombre, y cabe en todos sus tamaños", () => {
    const source = readFileSync("../backend/app/domains/office/furniture_catalog.py", "utf-8");
    const block = source.slice(source.indexOf("GROUPS:"), source.indexOf("FURNITURE: dict"));
    const keys = [...block.matchAll(/"([a-z_]+)": (?:LONG|ONE|TWO|\()/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(55);
    for (const key of keys) {
      expect(hasModel(key), key).toBe(true);
      expect(FURNITURE_LABELS[key], key).toBeTruthy();
      for (const [width, depth] of [[1, 1], [2, 1], [3, 1], [2, 2], [3, 3], [5, 3]]) {
        if (key === "plant" || key === "soundproof_booth" || key === "reception_desk") continue;
        for (const part of buildParts(key, width, depth, "dark")) expect(part.slice(0, 4).every(Number.isFinite), key).toBe(true);
      }
    }
  });

  it("un escritorio de 3 lleva tres pantallas y un archivador de 2, dos cuerpos", () => {
    const screens = (width: number) => buildParts("desk", width, 1, "classic").filter((p) => p[7]).length;
    expect(screens(3)).toBe(3 * screens(1));
    expect(buildParts("filing_cabinet", 2, 1, "classic")).toHaveLength(2 * buildParts("filing_cabinet", 1, 1, "classic").length);
  });

  it("cada estética cambia materiales y mantiene las piezas", () => {
    const classic = buildParts("sofa", 2, 1, "classic");
    for (const style of Object.keys(STYLE_PALETTES).filter((s) => s !== "classic")) {
      const other = buildParts("sofa", 2, 1, style);
      expect(other).toHaveLength(classic.length);
      expect(other[0][4]).not.toBe(classic[0][4]);
    }
  });
});
