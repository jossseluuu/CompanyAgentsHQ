/** Modelos de bloques: cada mueble se construye para su tamaño y su estética, nunca estirando una caja. */
export type Part = [w: number, h: number, d: number, y: number, color: string, x?: number, z?: number, glow?: boolean];

const WOOD = "#b7793a";
const WOOD_DARK = "#7c4a21";
const METAL = "#64748b";
const METAL_LIGHT = "#94a3b8";
const INK = "#1e293b";
const FABRIC = "#c2410c";
const FABRIC_DARK = "#9a3412";
const FABRIC_LIGHT = "#ea580c";
const STONE = "#57534e";
const STONE_LIGHT = "#78716c";
const RUG = "#be185d";
const RUG_LIGHT = "#f9a8d4";
const POT = "#c2703d";

/** Cada estética cambia materiales, no piezas: los colores de pantallas y libros se quedan. */
export const STYLE_PALETTES: Record<string, Record<string, string>> = {
  classic: {},
  dark: {
    [WOOD]: "#44403c", [WOOD_DARK]: "#1c1917", [METAL]: "#27272a", [METAL_LIGHT]: "#3f3f46", [FABRIC]: "#334155",
    [FABRIC_DARK]: "#1e293b", [FABRIC_LIGHT]: "#475569", [STONE]: "#27272a", [STONE_LIGHT]: "#3f3f46",
    [RUG]: "#1e293b", [RUG_LIGHT]: "#64748b", [POT]: "#27272a",
  },
  light: {
    [WOOD]: "#f1e7d8", [WOOD_DARK]: "#d6c7b0", [METAL]: "#e2e8f0", [METAL_LIGHT]: "#f8fafc", [FABRIC]: "#e7e5e4",
    [FABRIC_DARK]: "#d6d3d1", [FABRIC_LIGHT]: "#f5f5f4", [STONE]: "#e7e5e4", [STONE_LIGHT]: "#fafaf9",
    [RUG]: "#d6d3d1", [RUG_LIGHT]: "#fafaf9", [POT]: "#f5f5f4",
  },
  vivid: {
    [WOOD]: "#0d9488", [WOOD_DARK]: "#115e59", [METAL]: "#7c3aed", [METAL_LIGHT]: "#a78bfa", [FABRIC]: "#db2777",
    [FABRIC_DARK]: "#9d174d", [FABRIC_LIGHT]: "#f472b6", [STONE]: "#0369a1", [STONE_LIGHT]: "#0ea5e9",
    [RUG]: "#ca8a04", [RUG_LIGHT]: "#fde047", [POT]: "#7c3aed",
  },
};

export const STYLE_SWATCH: Record<string, string> = { classic: WOOD, dark: "#1c1917", light: "#f1e7d8", vivid: "#0d9488" };

const shelf = (y: number, colors: string[]): Part[] => colors.map((color, index) => [0.14, 0.2, 0.22, y, color, -0.27 + index * 0.18, 0.08]);

/** Piezas de una sola casilla: se repiten en cada casilla del mueble. */
const UNITS: Record<string, Part[]> = {
  filing_cabinet: [
    [0.7, 1.1, 0.5, 0.55, METAL],
    [0.62, 0.3, 0.02, 0.92, METAL_LIGHT, 0, 0.26],
    [0.62, 0.3, 0.02, 0.58, METAL_LIGHT, 0, 0.26],
    [0.62, 0.3, 0.02, 0.24, METAL_LIGHT, 0, 0.26],
    [0.16, 0.03, 0.03, 0.92, "#e2e8f0", 0, 0.28],
    [0.16, 0.03, 0.03, 0.58, "#e2e8f0", 0, 0.28],
    [0.16, 0.03, 0.03, 0.24, "#e2e8f0", 0, 0.28],
  ],
  bookshelf: [
    [0.85, 1.28, 0.34, 0.64, WOOD_DARK],
    [0.74, 0.03, 0.3, 0.42, WOOD, 0, 0.03],
    [0.74, 0.03, 0.3, 0.84, WOOD, 0, 0.03],
    ...shelf(0.22, ["#2563eb", "#dc2626", "#16a34a", "#f59e0b"]),
    ...shelf(0.56, ["#7c3aed", "#0ea5e9", "#ef4444", "#22c55e"]),
    ...shelf(0.98, ["#f97316", "#14b8a6", "#6366f1", "#ec4899"]),
  ],
  coffee_machine: [
    [0.7, 0.5, 0.5, 0.25, WOOD_DARK],
    [0.46, 0.5, 0.38, 0.75, "#475569"],
    [0.3, 0.14, 0.03, 0.86, "#fbbf24", 0, 0.2, true],
    [0.1, 0.1, 0.1, 0.55, "#f8fafc", 0, 0.1],
  ],
  inbox: [
    [0.56, 0.52, 0.42, 0.26, "#475569"],
    [0.62, 0.14, 0.46, 0.6, "#6366f1"],
    [0.5, 0.05, 0.36, 0.69, "#f8fafc"],
    [0.1, 0.1, 0.02, 0.32, "#fbbf24", 0, 0.22, true],
  ],
  lamp: [
    [0.3, 0.05, 0.3, 0.03, INK],
    [0.05, 1.2, 0.05, 0.62, INK],
    [0.36, 0.26, 0.36, 1.32, "#fde68a", 0, 0, true],
  ],
  water_cooler: [
    [0.4, 0.66, 0.4, 0.33, "#e2e8f0"],
    [0.32, 0.4, 0.32, 0.86, "#7dd3fc", 0, 0, true],
    [0.12, 0.06, 0.03, 0.5, "#2563eb", 0, 0.21],
  ],
  office_chair: [
    [0.46, 0.08, 0.46, 0.42, FABRIC], [0.46, 0.5, 0.08, 0.72, FABRIC_DARK, 0, -0.2], [0.08, 0.36, 0.08, 0.2, METAL], [0.46, 0.05, 0.46, 0.03, INK],
  ],
  locker: [
    [0.8, 1.5, 0.5, 0.75, METAL], [0.72, 1.4, 0.02, 0.75, METAL_LIGHT, 0, 0.26], [0.04, 0.16, 0.03, 0.8, "#e2e8f0", 0.26, 0.28], [0.4, 0.05, 0.02, 1.3, INK, 0, 0.27],
  ],
  sideboard: [
    [0.92, 0.66, 0.46, 0.4, WOOD], [0.4, 0.5, 0.02, 0.4, WOOD_DARK, -0.22, 0.24], [0.4, 0.5, 0.02, 0.4, WOOD_DARK, 0.22, 0.24],
  ],
  computer: [
    [0.5, 0.34, 0.05, 0.62, INK, 0, -0.1], [0.44, 0.28, 0.02, 0.62, "#38bdf8", 0, -0.07, true], [0.1, 0.2, 0.1, 0.4, METAL, 0, -0.1], [0.5, 0.3, 0.5, 0.15, WOOD_DARK], [0.34, 0.02, 0.14, 0.31, "#e2e8f0", 0, 0.14],
  ],
  laptop: [
    [0.5, 0.42, 0.5, 0.21, WOOD], [0.42, 0.03, 0.3, 0.44, METAL_LIGHT, 0, 0.06], [0.42, 0.26, 0.03, 0.57, INK, 0, -0.1], [0.36, 0.2, 0.02, 0.57, "#38bdf8", 0, -0.08, true],
  ],
  projector: [
    [0.08, 1.1, 0.08, 0.55, METAL], [0.5, 0.16, 0.42, 1.18, "#e2e8f0"], [0.14, 0.12, 0.04, 1.18, "#fde68a", 0, 0.22, true],
  ],
  server_rack: [
    [0.8, 1.7, 0.7, 0.85, INK], [0.68, 0.22, 0.02, 1.45, "#334155", 0, 0.36], [0.68, 0.22, 0.02, 1.1, "#334155", 0, 0.36], [0.68, 0.22, 0.02, 0.75, "#334155", 0, 0.36], [0.68, 0.22, 0.02, 0.4, "#334155", 0, 0.36],
    [0.05, 0.05, 0.02, 1.45, "#22c55e", 0.26, 0.37, true], [0.05, 0.05, 0.02, 1.1, "#22c55e", 0.26, 0.37, true], [0.05, 0.05, 0.02, 0.75, "#f59e0b", 0.26, 0.37, true],
  ],
  photocopier: [
    [0.84, 0.8, 0.7, 0.4, "#cbd5e1"], [0.84, 0.16, 0.7, 0.88, "#94a3b8"], [0.5, 0.04, 0.4, 0.98, "#f8fafc"], [0.2, 0.08, 0.02, 0.7, "#22c55e", 0.2, 0.36, true],
  ],
  scanner: [
    [0.6, 0.5, 0.5, 0.25, WOOD_DARK], [0.56, 0.1, 0.42, 0.55, "#475569"], [0.48, 0.02, 0.34, 0.61, "#7dd3fc", 0, 0, true],
  ],
  shredder: [
    [0.5, 0.66, 0.4, 0.33, INK], [0.5, 0.16, 0.42, 0.74, "#475569"], [0.32, 0.02, 0.05, 0.83, "#0f172a"],
  ],
  water_dispenser: [
    [0.44, 1, 0.42, 0.5, "#e2e8f0"], [0.3, 0.14, 0.03, 0.72, "#1e293b", 0, 0.22], [0.1, 0.06, 0.03, 0.74, "#38bdf8", 0, 0.24, true],
  ],
  vending_machine: [
    [0.86, 1.7, 0.7, 0.85, "#b91c1c"], [0.54, 1.2, 0.02, 1.05, "#bae6fd", -0.1, 0.36, true], [0.18, 0.4, 0.02, 1.2, INK, 0.3, 0.36], [0.5, 0.16, 0.02, 0.24, INK, -0.1, 0.36],
    ...shelf(0.95, ["#f59e0b", "#22c55e", "#ec4899", "#6366f1"]).map(([w, h, , y, color, x]): Part => [w, h, 0.04, y, color, (x ?? 0) - 0.1, 0.38]),
  ],
  drink_vending_machine: [
    [0.86, 1.7, 0.7, 0.85, "#1d4ed8"], [0.54, 1.2, 0.02, 1.05, "#bae6fd", -0.1, 0.36, true], [0.18, 0.4, 0.02, 1.2, INK, 0.3, 0.36], [0.5, 0.16, 0.02, 0.24, INK, -0.1, 0.36],
    ...shelf(1.2, ["#ef4444", "#ef4444", "#22c55e", "#22c55e"]).map(([w, h, , y, color, x]): Part => [w, h, 0.04, y, color, (x ?? 0) - 0.1, 0.38]),
  ],
  refrigerator: [
    [0.8, 1.7, 0.72, 0.85, "#e2e8f0"], [0.76, 0.02, 0.02, 1.15, "#94a3b8", 0, 0.37], [0.04, 0.34, 0.03, 1.4, METAL, 0.3, 0.38], [0.04, 0.4, 0.03, 0.85, METAL, 0.3, 0.38],
  ],
  microwave: [
    [0.7, 0.62, 0.5, 0.31, WOOD_DARK], [0.6, 0.32, 0.42, 0.78, "#cbd5e1"], [0.38, 0.22, 0.02, 0.78, "#1e293b", -0.08, 0.22], [0.1, 0.22, 0.02, 0.78, "#22c55e", 0.2, 0.22, true],
  ],
  air_conditioner: [
    [0.46, 1.5, 0.34, 0.75, "#f1f5f9"], [0.36, 0.3, 0.02, 1.2, "#94a3b8", 0, 0.18], [0.14, 0.05, 0.02, 0.6, "#38bdf8", 0, 0.18, true],
  ],
  air_purifier: [
    [0.4, 0.8, 0.4, 0.4, "#f8fafc"], [0.3, 0.42, 0.02, 0.4, "#cbd5e1", 0, 0.21], [0.2, 0.03, 0.2, 0.82, "#67e8f9", 0, 0, true],
  ],
  fan: [
    [0.34, 0.05, 0.34, 0.03, INK], [0.05, 0.9, 0.05, 0.47, METAL], [0.6, 0.6, 0.05, 1.1, METAL_LIGHT], [0.12, 0.12, 0.08, 1.1, INK, 0, 0.04],
  ],
  heater: [
    [0.84, 0.56, 0.2, 0.34, "#e2e8f0"], [0.05, 0.5, 0.22, 0.34, "#cbd5e1", -0.3], [0.05, 0.5, 0.22, 0.34, "#cbd5e1", -0.15], [0.05, 0.5, 0.22, 0.34, "#cbd5e1"], [0.05, 0.5, 0.22, 0.34, "#cbd5e1", 0.15], [0.05, 0.5, 0.22, 0.34, "#cbd5e1", 0.3],
  ],
  phone_booth: [
    [0.92, 0.08, 0.92, 0.04, INK], [0.06, 1.8, 0.92, 0.9, FABRIC_DARK, -0.43], [0.06, 1.8, 0.92, 0.9, FABRIC_DARK, 0.43], [0.92, 1.8, 0.06, 0.9, FABRIC_DARK, 0, -0.43], [0.92, 0.08, 0.92, 1.84, INK], [0.5, 0.05, 0.3, 0.8, WOOD, 0, -0.24],
  ],
  trash_can: [[0.36, 0.56, 0.36, 0.28, INK], [0.4, 0.05, 0.4, 0.58, METAL]],
  recycling_bin: [[0.4, 0.62, 0.4, 0.31, "#16a34a"], [0.44, 0.06, 0.44, 0.64, "#15803d"], [0.2, 0.2, 0.02, 0.32, "#f8fafc", 0, 0.21]],
  vacuum_cleaner: [
    [0.4, 0.22, 0.56, 0.14, "#dc2626"], [0.05, 0.8, 0.05, 0.56, METAL, 0, -0.14], [0.2, 0.05, 0.05, 0.98, INK, 0, -0.14], [0.08, 0.08, 0.2, 0.06, INK, -0.2, 0.1], [0.08, 0.08, 0.2, 0.06, INK, 0.2, 0.1],
  ],
  fire_extinguisher: [[0.34, 0.05, 0.34, 0.03, METAL], [0.22, 0.66, 0.22, 0.38, "#dc2626"], [0.1, 0.14, 0.1, 0.78, INK], [0.2, 0.04, 0.05, 0.84, INK, 0.06]],
  security_camera: [
    [0.3, 0.05, 0.3, 0.03, METAL], [0.05, 1.5, 0.05, 0.77, METAL], [0.2, 0.16, 0.36, 1.56, "#f1f5f9", 0, 0.1], [0.06, 0.06, 0.02, 1.56, "#ef4444", 0, 0.29, true],
  ],
  turnstile: [
    [0.3, 0.96, 0.8, 0.48, METAL], [0.5, 0.05, 0.05, 0.8, METAL_LIGHT, 0.3, 0], [0.34, 0.03, 0.14, 0.97, "#22c55e", 0, 0, true],
  ],
  wall_clock: [[0.05, 1.1, 0.05, 0.55, METAL], [0.5, 0.5, 0.05, 1.3, WOOD_DARK], [0.42, 0.42, 0.02, 1.3, "#f8fafc", 0, 0.03], [0.03, 0.17, 0.02, 1.38, INK, 0, 0.04], [0.14, 0.03, 0.02, 1.3, INK, 0.07, 0.04]],
  mirror: [[0.62, 1.6, 0.06, 0.8, WOOD], [0.52, 1.5, 0.02, 0.8, "#bae6fd", 0, 0.04, true], [0.5, 0.05, 0.3, 0.03, WOOD_DARK]],
  sculpture: [[0.5, 0.5, 0.5, 0.25, "#f1f5f9"], [0.2, 0.42, 0.2, 0.7, METAL_LIGHT, -0.04], [0.26, 0.2, 0.2, 0.98, METAL, 0.06], [0.14, 0.2, 0.14, 1.18, METAL_LIGHT, -0.02]],
  aquarium: [
    [0.9, 0.5, 0.56, 0.25, WOOD_DARK], [0.9, 0.56, 0.56, 0.78, "#22d3ee", 0, 0, true], [0.92, 0.04, 0.58, 1.08, INK], [0.12, 0.08, 0.04, 0.8, "#f97316", 0.2, 0.28, true], [0.1, 0.08, 0.04, 0.68, "#fde047", -0.2, 0.28, true],
  ],
  umbrella_stand: [[0.28, 0.54, 0.28, 0.27, METAL], [0.04, 0.8, 0.04, 0.6, "#1d4ed8", -0.05], [0.04, 0.8, 0.04, 0.6, "#dc2626", 0.06, 0.04]],
  magazine_rack: [[0.56, 0.9, 0.22, 0.45, WOOD_DARK], [0.46, 0.18, 0.04, 0.72, "#f472b6", 0, 0.12], [0.46, 0.18, 0.04, 0.42, "#60a5fa", 0, 0.12], [0.46, 0.18, 0.04, 0.14, "#fde047", 0, 0.12]],
  information_kiosk: [[0.5, 0.05, 0.4, 0.03, INK], [0.16, 1, 0.16, 0.52, METAL], [0.52, 0.72, 0.08, 1.28, INK], [0.44, 0.64, 0.02, 1.28, "#38bdf8", 0, 0.05, true]],
  platform_trolley: [[0.84, 0.05, 0.6, 0.2, METAL_LIGHT], [0.05, 0.6, 0.5, 0.5, METAL, -0.4], [0.1, 0.1, 0.1, 0.07, INK, -0.32, -0.22], [0.1, 0.1, 0.1, 0.07, INK, 0.32, -0.22], [0.1, 0.1, 0.1, 0.07, INK, -0.32, 0.22], [0.1, 0.1, 0.1, 0.07, INK, 0.32, 0.22], [0.5, 0.36, 0.42, 0.4, "#b7793a", 0.1]],
  printer: [
    [0.7, 0.42, 0.5, 0.21, "#475569"],
    [0.62, 0.2, 0.46, 0.52, "#cbd5e1"],
    [0.4, 0.02, 0.3, 0.63, "#f8fafc"],
    [0.1, 0.05, 0.02, 0.52, "#22c55e", 0.2, 0.24, true],
  ],
};

/** Centros de los huecos repartidos a lo largo de un mueble. */
function across(width: number, step = 1): number[] {
  const count = Math.max(Math.round(width / step), 1);
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}

function desk(width: number, depth: number): Part[] {
  const [x, z] = [width / 2 - 0.1, depth / 2 - 0.15];
  const legs: Part[] = [[-x, -z], [x, -z], [-x, z], [x, z]].map(([a, b]) => [0.07, 0.42, 0.07, 0.21, WOOD_DARK, a, b]);
  const screens = across(width).flatMap((c): Part[] => [
    [0.46, 0.3, 0.04, 0.72, INK, c, -0.14],
    [0.4, 0.24, 0.02, 0.72, "#38bdf8", c, -0.115, true],
    [0.08, 0.1, 0.06, 0.54, METAL, c, -0.14],
    [0.3, 0.02, 0.12, 0.51, "#e2e8f0", c, 0.1],
  ]);
  return [[width - 0.08, 0.07, depth - 0.4, 0.46, WOOD], ...legs, ...screens, [0.1, 0.09, 0.1, 0.545, "#f87171", width / 2 - 0.18, 0.12]];
}

function sofa(width: number): Part[] {
  return [
    [width - 0.04, 0.24, 0.6, 0.2, FABRIC],
    [width - 0.04, 0.42, 0.16, 0.42, FABRIC_DARK, 0, -0.24],
    [0.14, 0.32, 0.6, 0.34, FABRIC_DARK, -(width / 2 - 0.06)],
    [0.14, 0.32, 0.6, 0.34, FABRIC_DARK, width / 2 - 0.06],
    ...across(width - 0.28, 0.42).map((x): Part => [0.36, 0.1, 0.4, 0.36, FABRIC_LIGHT, x, 0.04]),
  ];
}

/** Paneles de una pieza: se ensanchan y conservan el grosor y las patas. */
function panel(width: number, frame: string, face: string, marks: Part[]): Part[] {
  const feet = width === 1 ? [-0.3, 0.3] : [-(width / 2 - 0.2), width / 2 - 0.2];
  return [
    [width - 0.04, 0.7, 0.05, 0.86, frame],
    [width - 0.14, 0.6, 0.02, 0.86, face, 0, 0.03],
    ...across(width).flatMap((c) => marks.map(([w, h, d, y, color, x = 0, z = 0, glow]): Part => [w, h, d, y, color, x + c, z, glow])),
    ...feet.map((x): Part => [0.06, 0.52, 0.06, 0.26, METAL_LIGHT, x]),
  ];
}

function screen(width: number): Part[] {
  return [
    [width, 0.62, 0.07, 1, INK],
    [width - 0.1, 0.52, 0.02, 1, "#22d3ee", 0, 0.045, true],
    ...across(width).flatMap((c): Part[] => [
      [0.5, 0.05, 0.02, 1.1, "#ecfeff", c - 0.1, 0.06, true],
      [0.3, 0.05, 0.02, 0.96, "#ecfeff", c - 0.2, 0.06, true],
    ]),
    [0.1, 0.68, 0.1, 0.34, METAL],
    [Math.min(width * 0.5, 1.2), 0.05, 0.3, 0.03, METAL],
  ];
}

function meetingTable(width: number, depth: number): Part[] {
  const [top, side] = [width - 0.6, Math.max(depth - 1.8, 0.6)];
  const seats = across(width - 1, 0.8);
  return [
    [top, 0.1, side, 0.5, STONE],
    [top - 0.2, 0.02, side - 0.2, 0.56, STONE_LIGHT],
    [0.5, 0.45, Math.min(side, 0.5), 0.23, "#44403c"],
    ...seats.flatMap((x): Part[] => [
      [0.3, 0.3, 0.3, 0.2, METAL, x, side / 2 + 0.25],
      [0.3, 0.3, 0.3, 0.2, METAL, x, -(side / 2 + 0.25)],
    ]),
  ];
}

function rug(width: number, depth: number): Part[] {
  return [
    [width - 0.04, 0.03, depth - 0.04, 0.03, RUG],
    [width - 0.24, 0.035, depth - 0.24, 0.035, RUG_LIGHT],
    [width - 0.5, 0.04, depth - 0.5, 0.04, RUG],
  ];
}

function plant(size: number): Part[] {
  const k = size === 1 ? 1 : 1.9;
  return [
    [0.32 * k, 0.26, 0.32 * k, 0.13, POT],
    [0.36 * k, 0.04, 0.36 * k, 0.27, "#9a5128"],
    [0.1 * k, 0.24 * k, 0.1 * k, 0.28 + 0.12 * k, "#4d7c0f"],
    [0.5 * k, 0.26 * k, 0.5 * k, 0.56 * k, "#16a34a"],
    [0.36 * k, 0.22 * k, 0.36 * k, 0.78 * k, "#22c55e"],
    [0.2 * k, 0.16 * k, 0.2 * k, 0.96 * k, "#4ade80"],
  ];
}

const BUILDERS: Record<string, (width: number, depth: number) => Part[]> = {
  desk,
  sofa,
  rug,
  meeting_table: meetingTable,
  plant,
  screen,
  carpet: (width, depth) => rug(width, depth).map(([w, h, d, y, , x, z, glow], i): Part => [w, h, d, y, i === 1 ? "#475569" : "#334155", x, z, glow]),
  reception_desk: reception,
  soundproof_booth: booth,
  industrial_workbench: workbench,
  pallet_rack: (width) => rack(width, [0.2, 0.85, 1.5], "#1d4ed8", "#f97316", true),
  warehouse_rack: (width) => rack(width, [0.3, 0.8, 1.3], METAL, METAL_LIGHT, true),
  curtain: (width) => drapes(width, "#be123c", "#9f1239", 6),
  blinds: (width) => drapes(width, "#e2e8f0", "#cbd5e1", 8),
  television: (width) => screen(width).map(([w, h, d, y, color, x, z, glow]): Part => [w, h, d, y - 0.1, color === "#22d3ee" ? "#6366f1" : color, x, z, glow]),
  interactive_board: (width) => panel(width, INK, "#0ea5e9", [[0.3, 0.3, 0.02, 0.9, "#e0f2fe", -0.15, 0.05, true]]),
  magnetic_board: (width) => panel(width, METAL, "#e2e8f0", [[0.1, 0.1, 0.03, 1, "#dc2626", -0.2, 0.05], [0.1, 0.1, 0.03, 0.78, "#2563eb", 0.2, 0.05], [0.26, 0.2, 0.02, 0.86, "#fef3c7", 0, 0.05]]),
  bulletin_board: (width) => panel(width, WOOD_DARK, "#b45309", [[0.24, 0.28, 0.02, 0.96, "#f8fafc", -0.2, 0.05], [0.22, 0.2, 0.02, 0.76, "#fde047", 0.2, 0.05]]),
  projector_screen: (width) => panel(width, METAL_LIGHT, "#f8fafc", []),
  flip_chart: () => [...panel(1, WOOD_DARK, "#f8fafc", [[0.5, 0.03, 0.02, 1, "#1d4ed8", 0, 0.05], [0.4, 0.03, 0.02, 0.86, "#dc2626", 0, 0.05]]).slice(0, 4), [0.05, 0.86, 0.05, 0.3, WOOD_DARK, 0, -0.18], [0.05, 0.52, 0.05, 0.26, WOOD_DARK, -0.3], [0.05, 0.52, 0.05, 0.26, WOOD_DARK, 0.3]],
  painting: (width) => panel(width, WOOD, "#fef3c7", [[0.5, 0.26, 0.02, 0.8, "#0ea5e9", 0, 0.05], [0.3, 0.2, 0.02, 0.94, "#f97316", 0.1, 0.05]]),
  board: (width) => panel(width, "#fbbf24", "#fef3c7", [[0.2, 0.2, 0.02, 0.94, "#f472b6", -0.2, 0.05], [0.2, 0.2, 0.02, 0.76, "#60a5fa", 0.2, 0.05]]),
  whiteboard: (width) => panel(width, "#cbd5e1", "#f8fafc", [[0.5, 0.04, 0.02, 1, "#2563eb", -0.1, 0.05], [0.34, 0.04, 0.02, 0.9, "#dc2626", -0.18, 0.05]]),
};

/** Mueble largo sobre una estructura: las baldas y el tablero se ensanchan, los postes se quedan en cada casilla. */
function rack(width: number, shelves: number[], frame: string, top: string, load: boolean): Part[] {
  const posts = [...across(width).map((x) => x - 0.46), width / 2 - 0.04];
  const levels = shelves.map((y): Part => [width - 0.04, 0.06, 0.74, y, top]);
  const goods = load ? across(width).flatMap((x) => shelves.map((y, i): Part => [0.62, 0.3, 0.6, y + 0.18, i % 2 ? "#b7793a" : "#92400e", x])) : [];
  return [...posts.flatMap((x): Part[] => [[0.06, 1.7, 0.06, 0.85, frame, x, 0.34], [0.06, 1.7, 0.06, 0.85, frame, x, -0.34]]), ...levels, ...goods];
}

function workbench(width: number): Part[] {
  const posts = [...across(width).map((x) => x - 0.46), width / 2 - 0.04];
  return [
    [width - 0.04, 0.08, 0.74, 0.82, WOOD],
    [width - 0.1, 0.05, 0.6, 0.3, METAL],
    ...posts.flatMap((x): Part[] => [[0.07, 0.8, 0.07, 0.4, METAL, x, 0.32], [0.07, 0.8, 0.07, 0.4, METAL, x, -0.32]]),
    [0.34, 0.14, 0.2, 0.93, "#dc2626", width / 2 - 0.4],
  ];
}

function reception(width: number): Part[] {
  return [
    [width - 0.04, 1.02, 0.36, 0.51, WOOD_DARK, 0, -0.22],
    [width - 0.04, 0.06, 0.56, 1.05, WOOD, 0, -0.12],
    [width - 0.3, 0.7, 0.02, 0.5, WOOD, 0, -0.03],
    ...across(width).slice(0, 1).flatMap((x): Part[] => [[0.46, 0.3, 0.04, 1.26, INK, x, -0.3], [0.4, 0.24, 0.02, 1.26, "#38bdf8", x, -0.27, true]]),
  ];
}

function drapes(width: number, base: string, dark: string, strips: number): Part[] {
  const bars = across(width - 0.1, (width - 0.1) / (strips * width));
  return [
    [width, 0.05, 0.08, 1.74, METAL],
    ...bars.map((x, i): Part => [(width - 0.1) / (strips * width), 1.62, 0.06, 0.9, i % 2 ? base : dark, x]),
    ...across(width).map((x): Part => [0.4, 0.04, 0.2, 0.02, METAL, x]),
  ];
}

function booth(): Part[] {
  return [
    [1.92, 0.08, 1.92, 0.04, INK],
    [0.08, 1.9, 1.92, 0.95, FABRIC_DARK, -0.92],
    [0.08, 1.9, 1.92, 0.95, FABRIC_DARK, 0.92],
    [1.92, 1.9, 0.08, 0.95, FABRIC_DARK, 0, -0.92],
    [0.9, 1.9, 0.08, 0.95, FABRIC_DARK, -0.5, 0.92],
    [0.9, 1.9, 0.04, 0.95, "#bae6fd", 0.46, 0.92, true],
    [1.92, 0.08, 1.92, 1.94, INK],
    [1.2, 0.05, 0.5, 0.74, WOOD, 0, -0.6],
  ];
}

function repeated(unit: Part[], width: number, depth: number): Part[] {
  const copies: Part[] = [];
  for (const i of across(width)) {
    for (const j of across(depth)) {
      for (const [w, h, d, y, color, x = 0, z = 0, glow] of unit) copies.push([w, h, d, y, color, x + i, z + j, glow]);
    }
  }
  return copies;
}

export const hasModel = (key: string) => key in BUILDERS || key in UNITS;

export function buildParts(key: string, width: number, depth: number, variant: string): Part[] {
  const builder = BUILDERS[key];
  const parts = builder ? builder(width, depth) : repeated(UNITS[key] ?? UNITS.inbox, width, depth);
  const palette = STYLE_PALETTES[variant] ?? {};
  return parts.map(([w, h, d, y, color, x, z, glow]) => [w, h, d, y, palette[color] ?? color, x, z, glow]);
}
