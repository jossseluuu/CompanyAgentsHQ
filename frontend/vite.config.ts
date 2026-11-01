/// <reference types="vitest/config" />
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.API_PROXY ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": backend,
      "/ws": { target: backend.replace("http", "ws"), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { three: ["three", "@react-three/fiber", "@react-three/drei"] } } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: { include: ["src/**"], exclude: ["src/office/OfficeScene.tsx", "src/office/AgentAvatar.tsx", "src/office/RoomMesh.tsx", "src/office/Furniture.tsx", "src/main.tsx"] },
  },
});
