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
  await expect(page.locator("[data-room=laboratorio]")).toBeVisible();
  await editor.getByLabel("Buscar mueble").fill("acuario");
  await expect(editor.getByRole("button", { name: "Acuario" })).toBeVisible();
  await editor.getByLabel("Buscar mueble").fill("");

  await editor.getByLabel(/^Sala/).selectOption({ label: "Archivo central" });
  const first = editor.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Mover hacia delante" }) }).first();
  const before = await first.getByRole("button").first().textContent();
  await first.getByRole("button", { name: "Mover hacia delante" }).click();
  await expect(first.getByRole("button").first()).not.toHaveText(before ?? "");
  await page.screenshot({ path: process.env.SHOTS + "/06-editor.png" });
  await editor.getByRole("button", { name: "Terminar" }).click();

  await page.getByRole("link", { name: "Organigrama" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Lola");
  await page.locator('select:has(option[value="clo"])').selectOption("clo");
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

test("plano: colocar un escritorio de 3 × 1, abrir una puerta y mover un puesto", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "✎ Editar oficina" }).click();
  const editor = page.getByRole("complementary", { name: "Editor de la oficina" });
  const plan = page.getByRole("application", { name: "Plano editable de la oficina" });
  await expect(plan).toBeVisible();
  const tile = async (x: number, y: number) => {
    const point = await plan.evaluate((svg: SVGSVGElement, [a, b]) => {
      const p = svg.createSVGPoint();
      p.x = a + 0.5;
      p.y = b + 0.5;
      const screen = p.matrixTransform(svg.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    }, [x, y]);
    return point;
  };

  await editor.getByRole("button", { name: "Escritorio" }).click();
  await editor.getByRole("group", { name: "Tamaño" }).getByRole("button", { name: "3×1" }).click();
  await editor.getByRole("group", { name: "Estética" }).getByRole("button", { name: "Oscuro" }).click();
  // Sala de descanso: x 11, y 21, 23 × 7, puerta en (22, 21).
  const spot = await tile(14, 25);
  await page.mouse.move(spot.x, spot.y);
  await expect(page.locator("[data-ghost]")).toHaveCount(3);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator("[data-furniture=desk] title", { hasText: "Escritorio 3×1" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  // El escritorio está a una fila de la pared: girarlo desde la esquina se saldría de la sala.
  const desk = page.locator("[data-furniture=desk]", { has: page.locator("title", { hasText: "Escritorio 3×1" }) });
  await page.mouse.click(spot.x, spot.y);
  await page.keyboard.press("r");
  await expect(desk).toHaveAttribute("data-rotation", "90");
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await editor.getByRole("button", { name: "⟳ Girar (R)" }).click();
  await expect(desk).toHaveAttribute("data-rotation", "180");
  await page.keyboard.press("Escape");

  await editor.getByRole("button", { name: "Lámpara" }).click();
  await page.keyboard.press("r");
  const lamp = await tile(20, 25);
  await page.mouse.click(lamp.x, lamp.y);
  await expect(page.locator("[data-furniture=lamp]")).toHaveAttribute("data-rotation", "90");
  await page.keyboard.press("Escape");

  await page.screenshot({ path: process.env.SHOTS + "/09-plano.png" });

  await editor.getByRole("button", { name: "Puertas" }).click();
  const wall = await tile(33, 24);
  await page.mouse.click(wall.x, wall.y);
  await expect(page.locator("rect[data-door='33,24']")).toHaveCount(1);
  await expect(page.locator("rect[data-door='22,21']")).toHaveCount(0);

  await editor.getByRole("button", { name: "Mover", exact: true }).click();
  const before = await page.locator("[data-agent=Diego] circle").getAttribute("cx");
  const from = await page.locator("[data-agent=Diego] circle").boundingBox();
  const to = await tile(16, 26);
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("[data-agent=Diego] circle")).not.toHaveAttribute("cx", before ?? "");

  await editor.getByRole("button", { name: "Ver en 3D" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.SHOTS + "/10-muebles-3d.png" });
  await editor.getByRole("button", { name: "Terminar" }).click();
});

test("equipo: ver y cambiar el prompt, y contratar con prompt propio", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Equipo" }).click();
  await page.getByRole("button", { name: "Gloria" }).click();
  const profile = page.getByRole("complementary", { name: "Ficha del agente" });
  await expect(profile.getByText("Lo que recibe el modelo")).toBeVisible();
  await expect(profile.getByText(/Reglas de trabajo: usa las herramientas/).first()).toBeVisible();
  const editor = profile.getByLabel(/Prompt de sistema/);
  const gloria = await editor.inputValue();
  await editor.fill(`${gloria}\nSé breve.`);
  await profile.getByRole("button", { name: "Guardar versión" }).click();
  await expect(profile.getByLabel("Prompt de sistema (versión 2)")).toBeVisible();

  // Cambiar de agente no debe arrastrar el texto del anterior.
  await page.getByRole("button", { name: "Bruno" }).click();
  await expect(profile.getByLabel(/Prompt de sistema/)).not.toHaveValue(/Sé breve/);

  await profile.getByRole("tab", { name: "Capacidades" }).click();
  await expect(profile.getByRole("checkbox", { name: /delete_file/ })).toBeChecked();
  await expect(profile.getByText("Control y aprobaciones")).toBeVisible();
  await profile.screenshot({ path: process.env.SHOTS + "/11-capacidades.png" });

  await page.getByRole("button", { name: "＋ Contratar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre", { exact: true }).fill("Iris");
  await dialog.locator('select:has(option[value="cao"])').selectOption("cao");
  await dialog.getByText(/Prompt y herramientas/).click();
  await expect(dialog.getByLabel("Prompt de sistema")).toHaveValue(/.+/);
  await dialog.getByLabel("Prompt de sistema").fill("Eres Iris, contable.");
  await dialog.getByRole("button", { name: "Contratar" }).click();
  await page.getByRole("button", { name: "Iris" }).click();
  await expect(profile.getByLabel(/Prompt de sistema/)).toHaveValue("Eres Iris, contable.");
  await page.screenshot({ path: process.env.SHOTS + "/12-equipo.png" });
});

test("vida en la oficina: los agentes sin trabajo se mueven solos", async ({ page }) => {
  await signIn(page);
  const places = () => page.evaluate(async () => (await (await fetch("/api/v1/agents")).json()).map((a: { pos_x: number; pos_y: number }) => `${a.pos_x},${a.pos_y}`).join(" "));
  const before = await places();
  await expect.poll(places, { timeout: 45000, intervals: [3000] }).not.toBe(before);
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

  await page.getByRole("navigation", { name: "Salas y agentes" }).getByRole("button", { name: "Finanzas", exact: true }).click();
  await page.getByRole("tab", { name: "⚙ Módulos" }).click();
  await page.getByLabel("Acceso de Bruno").selectOption("deny");
  await expect(page.getByLabel("Acceso de Bruno")).toHaveValue("deny");
  await expect(page.getByText("No entra", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("● En vivo")).toBeVisible();
  await page.getByRole("navigation", { name: "Salas y agentes" }).getByRole("button", { name: "Finanzas", exact: true }).click();
  await page.getByRole("tab", { name: "⚙ Módulos" }).click();
  await expect(page.getByLabel("Acceso de Bruno")).toHaveValue("deny");
  await page.getByLabel("Acceso de Bruno").selectOption("");
  await expect(page.getByText("No entra", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Tareas" }).click();
  await expect(page.getByRole("heading", { name: "Tareas" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Plan de contenidos" }).first()).toBeVisible();
  await page.screenshot({ path: process.env.SHOTS + "/08-tareas.png" });
});

test("eliminar la empresa la borra y vuelve al alta", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Ajustes" }).click();
  const erase = page.getByRole("button", { name: "Eliminar todo" });
  await expect(erase).toBeDisabled();
  await page.getByLabel(/para confirmar/).fill("Acme");
  await page.getByLabel("Tu contraseña").fill("mala");
  page.on("dialog", (dialog) => dialog.accept());
  await erase.click();
  await expect(page.getByRole("alert")).toHaveText("Contraseña incorrecta");
  await page.getByLabel("Tu contraseña").fill("contraseña-1");
  await erase.click();
  await expect(page.getByLabel("Nombre de la empresa")).toBeVisible();
  await page.getByLabel("Nombre de la empresa").fill("Acme");
  await page.getByLabel("Misión").fill("Vender más");
  await page.getByRole("button", { name: "Crear empresa" }).click();
  await expect(page.getByText("● En vivo")).toBeVisible();
});
