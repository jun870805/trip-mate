import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { create404Html, deploymentBase } from "./src/data/routing";

export default defineConfig(({ mode }) => {
  let resolvedBase = "/";
  return {
    base: deploymentBase({
      ...process.env,
      ...loadEnv(mode, process.cwd(), "VITE_"),
    }),
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "github-pages-fallback",
        configResolved(config) {
          resolvedBase = config.base;
        },
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "404.html",
            source: create404Html(resolvedBase),
          });
          this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
        },
      },
    ],
  };
});
