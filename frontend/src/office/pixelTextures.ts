import { CanvasTexture, Color, NearestFilter, RepeatWrapping, SRGBColorSpace } from "three";

const SIZE = 8;
const SKINS = ["#f6cfa8", "#e8b48a", "#c98f62", "#8d5a3b"];
const HAIRS = ["#2b1d14", "#5b3a1e", "#a8642a", "#e0b84c", "#3f3f46"];

type Paint = (x: number, y: number) => string;

const cache = new Map<string, CanvasTexture>();

/** Texturas de pocos píxeles generadas en memoria: sin ficheros binarios ni licencias que seguir. */
function pixelTexture(key: string, paint: Paint, size = SIZE) {
  const known = cache.get(key);
  if (known) return known;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      context.fillStyle = paint(x, y);
      context.fillRect(x, y, 1, 1);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  cache.set(key, texture);
  return texture;
}

const shade = (color: string, factor: number) => `#${new Color(color).multiplyScalar(factor).getHexString()}`;

/** Ruido determinista: la misma textura en cada carga. */
const speckle = (x: number, y: number) => ((x * 73 + y * 151 + x * y * 19) % 11) / 10;

export const speckleTexture = () =>
  pixelTexture("speckle", (x, y) => {
    const level = 205 + Math.round(speckle(x, y) * 50);
    return `rgb(${level},${level},${level})`;
  });

export const brickTexture = () =>
  pixelTexture("brick", (x, y) => {
    const offset = Math.floor(y / 2) % 2 === 0 ? 0 : 2;
    if (y % 2 === 1 || (x + offset) % 4 === 3) return "#9ca3af";
    return speckle(x, y) > 0.5 ? "#f1f5f9" : "#e2e8f0";
  });

export const tileTexture = () =>
  pixelTexture("tile", (x, y) => {
    if (x === 7 || y === 7) return "#b4b4b4";
    return speckle(x, y) > 0.7 ? "#e7e7e7" : "#ffffff";
  });

export const grassTexture = () =>
  pixelTexture("grass", (x, y) => {
    const value = speckle(x, y);
    if (value > 0.85) return "#6fcf7c";
    return value > 0.4 ? "#57bd6b" : "#4cb062";
  });

export const stoneTexture = () =>
  pixelTexture("stone", (x, y) => {
    if (x === 7 || y === 7) return "#8d97a5";
    return speckle(x, y) > 0.6 ? "#c3cad4" : "#b5bdc9";
  });

export const woodTexture = () =>
  pixelTexture("wood", (x, y) => {
    const plank = Math.floor(y / 4);
    if (y % 4 === 3 || (x + plank * 5) % 16 === 0) return "#a89b8c";
    return speckle(x, y + plank) > 0.65 ? "#efe6da" : "#fbf5ec";
  }, 16);

export const carpetTexture = () =>
  pixelTexture("carpet", (x, y) => ((x + y) % 4 === 0 ? "#eceff5" : speckle(x, y) > 0.7 ? "#f2f4f9" : "#ffffff"));

/** Copia que comparte la imagen y repite a su propia escala: una textura, muchas superficies. */
export function tiled(texture: CanvasTexture, width: number, height: number) {
  const copy = texture.clone();
  copy.repeat.set(width, height);
  copy.needsUpdate = true;
  return copy;
}

export interface Look {
  skin: string;
  hair: string;
}

/** Cada agente conserva su aspecto entre sesiones: se deriva de su id. */
export function lookFor(id: string): Look {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { skin: SKINS[hash % SKINS.length], hair: HAIRS[(hash >>> 8) % HAIRS.length] };
}

export function faceTexture({ skin, hair }: Look) {
  return pixelTexture(`face:${skin}:${hair}`, (x, y) => {
    if (y < 2 || ((x === 0 || x === 7) && y < 3)) return hair;
    if (y === 4 && (x === 2 || x === 5)) return "#1e293b";
    if (y === 4 && (x === 1 || x === 6)) return "#ffffff";
    if (y === 6 && x > 2 && x < 5) return shade(skin, 0.65);
    return skin;
  });
}

export const hairSideTexture = ({ skin, hair }: Look) =>
  pixelTexture(`side:${skin}:${hair}`, (x, y) => (y < 3 || (x < 3 && y < 6) ? hair : skin));

export const hairTexture = ({ hair }: Look) =>
  pixelTexture(`hair:${hair}`, (x, y) => (speckle(x, y) > 0.7 ? shade(hair, 0.8) : hair));

export const shirtTexture = (color: string) =>
  pixelTexture(`shirt:${color}`, (x, y) => {
    if (y === 7) return "#1f2937";
    if (y === 0 && x > 2 && x < 5) return "#ffffff";
    if (x === 0 || x === 7) return shade(color, 0.8);
    return color;
  });
