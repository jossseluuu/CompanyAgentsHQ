import { expect, type Page, test } from "@playwright/test";

/** Se ejecuta tras main-flow, que crea la cuenta y la empresa. */
async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Correo").fill("duena@example.com");
  await page.getByLabel(/Contraseña/).fill("contraseña-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("● En vivo")).toBeVisible();
}

test("editar la oficina: crear sala, mover un mueble y contratar con escritorio", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "✎ Editar oficina" }).click();
  const editor = page.getByRole("complementary", { name: "Editor de la oficina" });

  await editor.getByLabel("Nombre de la sala").fill("Laboratorio");
  await editor.getByRole("button", { name: "Crear sala" }).click();
  await expect(page.getByRole("navigation", { name: "Salas y agentes" }).getByText("Laboratorio")).toBeVisible();

  await editor.getByLabel(/^Sala/).selectOption({ label: "Archivo central" });
  const first = editor.getByRole("listitem").first();
  const before = await first.getByRole("button").first().textContent();
  await first.getByRole("button", { name: "Mover hacia delante" }).click();
  await expect(first.getByRole("button").first()).not.toHaveText(before ?? "");
  await page.screenshot({ path: process.env.SHOTS + "/06-editor.png" });
  await editor.getByRole("button", { name: "Terminar" }).click();

  await page.getByRole("link", { name: "Organigrama" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Lola");
  await page.getByLabel("Cargo").selectOption("clo");
  await page.getByRole("button", { name: "Contratar" }).click();
  await page.getByRole("link", { name: "Oficina" }).click();
  await expect(page.getByRole("navigation", { name: "Salas y agentes" }).getByRole("button", { name: "Personas y legal" })).toBeVisible();
});

test("tema claro e inglés", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByLabel("Tema").selectOption("light");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByLabel("Idioma").selectOption("en");
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Office" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.SHOTS + "/07-tema-claro-ingles.png" });
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Language").selectOption("es");
  await expect(page.getByRole("link", { name: "Ajustes" })).toBeVisible();
});

test("la empresa se descarga en un ZIP", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Ajustes" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exportar empresa" }).click()]);
  expect(download.suggestedFilename()).toBe("companyagentshq-export.zip");
});

test("gestión: departamentos, ficha del agente y vista global de tareas", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Organigrama" }).click();
  await page.getByRole("textbox", { name: "Nuevo departamento" }).fill("Calidad");
  await page.getByRole("textbox", { name: "Nuevo departamento" }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Nombre de Calidad" })).toBeVisible();

  await page.getByRole("link", { name: "Oficina" }).click();
  await page.getByRole("navigation", { name: "Salas y agentes" }).getByRole("button", { name: /Diego/ }).click();
  const profile = page.getByRole("complementary", { name: /Ficha/ });
  await profile.getByLabel(/^Departamento/).selectOption({ label: "Calidad" });
  await expect(profile.getByLabel(/^Departamento/)).toHaveValue(/.+/);

  await page.getByRole("link", { name: "Tareas" }).click();
  await expect(page.getByRole("heading", { name: "Tareas" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Plan de contenidos" }).first()).toBeVisible();
  await page.screenshot({ path: process.env.SHOTS + "/08-tareas.png" });
});
