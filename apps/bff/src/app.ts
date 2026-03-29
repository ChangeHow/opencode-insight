import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestLogger } from "./middleware/logger";
import { dashboard } from "./controllers/dashboard";
import { providers } from "./controllers/providers";
import { day } from "./controllers/day";
import { messages } from "./controllers/messages";
import { system } from "./controllers/system";

const app = new Hono();

app.use("/api/*", cors());
app.use("*", requestLogger());

app.route("/", dashboard);
app.route("/", providers);
app.route("/", day);
app.route("/", messages);
app.route("/", system);

export default app;
