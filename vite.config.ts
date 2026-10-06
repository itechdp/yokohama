import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import apiDev from "./vite-plugin-api-dev";

export default defineConfig(({ mode }) => {
  // loadEnv's default prefix filter ("VITE_") is for what's safe to expose to
  // client code via import.meta.env. The api/ dev middleware runs server-side
  // in this same Node process and needs the *unfiltered* .env (service role
  // key, JWT secrets) in process.env, the same way Vercel injects them in
  // production - so load everything here and copy it in explicitly.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), tailwindcss(), apiDev()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
    },
  };
});
