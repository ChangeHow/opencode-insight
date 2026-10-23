import { createInsightServer } from "./server";

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN;
if (!Number.isInteger(port) || port <= 0 || port > 65535 || !token) {
  throw new Error("OpenChamber must supply a service port and token.");
}
const server = createInsightServer(token);
server.listen(port, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
