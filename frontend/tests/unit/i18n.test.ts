import { describe, expect, it } from "vitest";

import { EN } from "@/shared/en";
import { t } from "@/shared/i18n";

const sources = import.meta.glob("/src/**/*.{ts,tsx}", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

describe("idiomas", () => {
  it("todo texto de la interfaz tiene su traducción al inglés", () => {
    const missing = new Set<string>();
    for (const code of Object.values(sources)) {
      for (const match of code.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) {
        const key = JSON.parse(`"${match[1]}"`) as string;
        if (!(key in EN)) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("los valores se colocan en su sitio y el español es el idioma por defecto", () => {
    expect(t("Copiar {0}", "plan.md")).toBe("Copiar plan.md");
  });
});
