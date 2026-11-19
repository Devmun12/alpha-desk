import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build`        -> static site for GitHub Pages (fetches live data from the API)
// `npm run build:single` -> one self-contained HTML file with the snapshot embedded
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
  server: { fs: { allow: [".."] } },
  build: { outDir: mode === "single" ? "dist-single" : "dist", sourcemap: mode !== "single" },
}));
