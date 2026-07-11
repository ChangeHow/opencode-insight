import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";
import createNodeAdapter from "@hono/vite-dev-server/node";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);

export default defineConfig({
  server: {
    host,
    port,
    strictPort: true,
  },
  plugins: [
    devServer({
      adapter: createNodeAdapter,
      entry: "./src/app.ts",
      injectClientScript: false,
    }),
  ],
});
