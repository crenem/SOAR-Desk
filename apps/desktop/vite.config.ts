import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: process.env.SOAR_DESK_DEVELOPMENT === "1" ? 1421 : 1420,
    strictPort: true,
    host: "127.0.0.1",
    // Cargo produces and locks executable build scripts. Never watch its output.
    watch: { ignored: ["**/src-tauri/target/**", "**/target/**"] },
  },
  envPrefix: ["VITE_"],
  build: { target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13" },
});
