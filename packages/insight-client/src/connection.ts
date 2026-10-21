import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Service } from "@opencode/client/service";
import { z } from "zod";

export class BridgeError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Connection {
  baseUrl: string;
  headers: HeadersInit;
}

const endpointSchema = z
  .object({
    url: z.string().url(),
    auth: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("basic"), username: z.string(), password: z.string() }),
        z.object({ type: z.literal("bearer"), token: z.string().min(1) }),
      ])
      .optional(),
  })
  .strict();

const configSchema = z.union([
  endpointSchema,
  z.object({ registrationFile: z.string().min(1) }).strict(),
]);

export function validateEndpoint(raw: string): string {
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new BridgeError(
      503,
      "OpenCode URL must be an origin without credentials, query, or path.",
    );
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new BridgeError(503, "Remote OpenCode connections require HTTPS.");
  }
  return url.origin;
}

export async function loadConnection(
  file = join(homedir(), ".config", "opencode-insight", "connection.json"),
  discover = Service.discover,
): Promise<Connection> {
  const metadata = await stat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw new BridgeError(503, "Cannot read Insight connection configuration.");
  });
  if (metadata && (!metadata.isFile() || metadata.size > 16384)) {
    throw new BridgeError(503, "Insight connection configuration is not a small JSON file.");
  }
  let config: z.infer<typeof configSchema> | undefined;
  if (metadata) {
    try {
      config = configSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch {
      throw new BridgeError(503, "Invalid Insight connection configuration.");
    }
    if (
      "auth" in config &&
      config.auth &&
      process.platform !== "win32" &&
      (metadata.mode & 0o077) !== 0
    ) {
      throw new BridgeError(503, "Insight connection credentials require file permissions 0600.");
    }
  }
  if (config && "url" in config) {
    const headers: Record<string, string> = {};
    if (config.auth?.type === "bearer") headers.authorization = `Bearer ${config.auth.token}`;
    if (config.auth?.type === "basic") {
      headers.authorization = `Basic ${Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64")}`;
    }
    return { baseUrl: validateEndpoint(config.url), headers };
  }
  const endpoint = await discover({
    file: config?.registrationFile,
    version: (version) => version.startsWith("2."),
  });
  if (!endpoint) {
    throw new BridgeError(
      503,
      "No running OpenCode V2 service found. Start OpenCode or configure connection.json.",
    );
  }
  return { baseUrl: validateEndpoint(endpoint.url), headers: Service.headers(endpoint) ?? {} };
}
