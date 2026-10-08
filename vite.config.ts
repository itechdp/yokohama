import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import cascadeLayers from "@csstools/postcss-cascade-layers";
import legacyWebview from "./postcss-legacy-webview";

// Oldest Chrome / Android WebView the CSS must still work on. Tailwind v4 on
// its own needs Chrome 111+; older warehouse tablets otherwise render the app
// completely unstyled.
const LEGACY_CHROME = 80 << 16;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: {
      // Chrome < 99 drops every rule inside @layer, which is all of Tailwind.
      plugins: [cascadeLayers(), legacyWebview()],
    },
    lightningcss: {
      targets: { chrome: LEGACY_CHROME, android: LEGACY_CHROME },
    },
  },
  build: {
    cssMinify: "lightningcss",
  },
  server: {
    port: 3000,
  },
});
