import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  /** Project-root public/ (icon.svg, etc.) copied to dist/ on build */
  publicDir: path.resolve(__dirname, "public"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@mui/") || id.includes("node_modules/@emotion/")) return "mui";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "react";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@renderer": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
