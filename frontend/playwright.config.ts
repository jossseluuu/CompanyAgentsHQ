import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:5173",
    viewport: { width: 1440, height: 900 },
    channel: process.env.E2E_CHANNEL,
  },
});
