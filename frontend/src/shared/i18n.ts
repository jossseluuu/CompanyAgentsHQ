import { EN } from "./en";

export type Language = "es" | "en";

const KEY = "cahq.language";

function stored(): Language {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

export const language: Language = stored();

/** La clave es el texto en español: lo que falte en inglés se ve en español, nunca vacío. */
export function t(text: string, ...values: unknown[]): string {
  const template = language === "en" ? (EN[text] ?? text) : text;
  return template.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ""));
}

/** Los textos se resuelven al cargar: cambiar de idioma recarga la página. */
export function setLanguage(next: Language) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return;
  }
  window.location.reload();
}

document.documentElement.lang = language;
