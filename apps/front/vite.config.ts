import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// En développement, l'API et le WebSocket passent par Traefik (docker compose) : VITE_API cible son adresse.
const api = process.env.VITE_API ?? "https://localhost:8443";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: api, changeOrigin: true, secure: false },
      "/ws": { target: api.replace(/^http/, "ws"), ws: true, changeOrigin: true, secure: false }
    }
  },
  build: { target: "es2022", chunkSizeWarningLimit: 900 }
});
