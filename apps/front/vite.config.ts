import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// En développement, l'API et le WebSocket passent par Traefik (docker compose) : VITE_API cible son adresse.
const api = process.env.VITE_API ?? "https://localhost:8443";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Sous Docker (docker-compose.dev.yml), les notifications de fichiers ne traversent pas
    // toujours le partage Windows <-> conteneur : le polling garantit le hot reload.
    // Sur Linux le bind-mount propage inotify, donc VITE_POLL_WATCH doit rester à "0".
    // Dans tous les cas on ignore public/models (690 .glb, ~730 Mo) : sinon le watcher
    // stat chaque fichier à chaque intervalle -> CPU >75% / RAM >8 Go puis SIGKILL.
    watch: {
      usePolling: process.env.VITE_POLL_WATCH === "1",
      interval: process.env.VITE_POLL_WATCH === "1" ? 2000 : 300,
      ignored: ["**/public/models/**", "**/node_modules/**", "**/dist/**", "**/.git/**"],
    },
    proxy: {
      "/api": { target: api, changeOrigin: true, secure: false },
      "/ws": { target: api.replace(/^http/, "ws"), ws: true, changeOrigin: true, secure: false }
    }
  },
  build: { target: "es2022", chunkSizeWarningLimit: 900 }
});
