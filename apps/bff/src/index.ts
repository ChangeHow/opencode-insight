import "./env.js";
import { serve } from "@hono/node-server";
import app from "./app.js";

process.title = "opencode-telescope-bff";

const port = Number(process.env.PORT ?? 8787);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`BFF listening on http://localhost:${info.port}`);
  },
);
