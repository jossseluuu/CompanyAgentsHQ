export type Theme = "dark" | "light";

const KEY = "cahq.theme";

export function currentTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Sin almacenamiento, el tema dura lo que la pestaña.
  }
  applyTheme(theme);
}
