import { BridgeError, type Connection } from "@opencode-insight/client";

export async function loadHostConnection(env = process.env): Promise<Connection> {
  const endpoint = env.OPENCHAMBER_OPENCODE_URL;
  const token = env.OPENCHAMBER_SERVICE_TOKEN;
  if (!endpoint || !token) {
    throw new BridgeError(503, "Insight requires OpenChamber's approved OpenCode service access.");
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BridgeError(503, "OpenChamber supplied an invalid OpenCode service address.");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new BridgeError(503, "OpenChamber must supply its loopback OpenCode service address.");
  }
  return { baseUrl: url.origin, headers: { authorization: `Bearer ${token}` } };
}
