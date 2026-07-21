import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: ["es2022", "chrome105", "safari15"],
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        master: fileURLToPath(new URL("./master.html", import.meta.url)),
        upload: fileURLToPath(new URL("./upload.html", import.meta.url)),
      },
      output: {
        manualChunks(id) {
          // recharts (+ its d3/react-smooth/lodash-ish dependency tree) is
          // only ever reachable via the lazy-loaded admin dashboard, but
          // Rollup's default chunking sometimes folds it into whichever
          // shared vendor chunk is largest — which was the public-links
          // bundle the master/upload customer pages also depend on. Forcing
          // it into its own chunk keeps that ~500KB out of every page that
          // isn't /admin.
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/d3-") ||
            id.includes("node_modules/victory-vendor") ||
            id.includes("node_modules/recharts-scale") ||
            id.includes("node_modules/decimal.js-light") ||
            id.includes("node_modules/react-smooth")
          ) {
            return "vendor-charts";
          }
        },
      },
    },
  },
});
