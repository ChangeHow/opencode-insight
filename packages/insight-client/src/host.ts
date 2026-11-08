import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  hostQuerySchema,
  hostSourceSchema,
  INSIGHT_HOST_SOURCE_EVENT,
  type HostSource,
} from "@opencode-insight/telemetry/host";
import { createBridge } from "./bridge";
import { BridgeError, type Connection } from "./connection";

type Source = HostSource & { directory: string };
type Receipt = { source: Source; resolve(): void; reject(error: Error): void };
type Stream = { key: string; controller: AbortController };

/** Bind local numeric reads to plugin events received through the host's approved connection. */
export function createHostBridge(connect: () => Promise<Connection>) {
  const sources = new Map<string, Source>();
  const waiting = new Set<{ notify(): void; reject(error: Error): void }>();
  const receipts = new Map<string, Receipt>();
  let stream: Stream | undefined;
  let closed = false;

  function interrupt(error: Error) {
    stream?.controller.abort();
    stream = undefined;
    sources.clear();
    for (const listener of [...waiting]) listener.reject(error);
    for (const receipt of [...receipts.values()]) receipt.reject(error);
  }

  function receive(event: unknown) {
    if (!event || typeof event !== "object" || !("type" in event)) return;
    if (event.type === "server.connected") {
      sources.clear();
      for (const receipt of [...receipts.values()])
        receipt.reject(new BridgeError(409, "The host-selected telemetry source changed."));
      return;
    }
    if (event.type !== INSIGHT_HOST_SOURCE_EVENT || !("data" in event) || !("location" in event))
      return;
    const parsed = hostSourceSchema.safeParse(event.data);
    const location = event.location;
    if (!parsed.success || !location || typeof location !== "object" || !("directory" in location))
      return;
    if (
      typeof location.directory !== "string" ||
      ("workspaceID" in location && location.workspaceID !== undefined)
    )
      return;
    const source = { ...parsed.data, directory: location.directory };
    sources.set(source.directory, source);
    for (const listener of [...waiting]) listener.notify();
    if (source.nonce) {
      const receipt = receipts.get(source.nonce);
      if (!receipt) return;
      if (receipt.source.directory !== source.directory || receipt.source.scope !== source.scope)
        receipt.reject(new BridgeError(409, "The host-selected telemetry source changed."));
      else receipt.resolve();
    }
  }

  async function consume(connection: Connection, owner: Stream) {
    const deadline = setTimeout(() => owner.controller.abort(), 8000);
    try {
      const response = await fetch(`${connection.baseUrl}/api/event`, {
        headers: {
          ...Object.fromEntries(new Headers(connection.headers)),
          accept: "text/event-stream",
        },
        redirect: "error",
        signal: owner.controller.signal,
      });
      clearTimeout(deadline);
      if (!response.ok || !response.body) throw new Error("Host event stream unavailable.");
      const decoder = new TextDecoder();
      let pending = "";
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        if (pending.length > 8_000_000) throw new Error("Host event exceeds the transport limit.");
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(pending))) {
          const block = pending.slice(0, boundary.index);
          pending = pending.slice(boundary.index + boundary[0].length);
          const data = block
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) receive(JSON.parse(data));
        }
      }
    } catch {
      // Stream bodies and transport failures can contain private session data.
    } finally {
      clearTimeout(deadline);
      if (stream === owner)
        interrupt(
          new BridgeError(
            502,
            "OpenChamber's telemetry event stream disconnected. Retry the query.",
          ),
        );
    }
  }

  function ensureStream(connection: Connection) {
    if (closed) throw new BridgeError(503, "The Insight bridge is closed.");
    const key = `${connection.baseUrl}\0${new Headers(connection.headers).get("authorization")}`;
    if (stream?.key === key) return;
    interrupt(new BridgeError(409, "The host-selected telemetry connection changed."));
    const owner = { key, controller: new AbortController() };
    stream = owner;
    void consume(connection, owner);
  }

  function sourceFor(directory: string, signal: AbortSignal): Promise<Source> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        waiting.delete(listener);
        signal.removeEventListener("abort", aborted);
      };
      const listener = {
        notify() {
          const source = sources.get(directory);
          if (!source) return;
          cleanup();
          resolve(source);
        },
        reject(error: Error) {
          cleanup();
          reject(error);
        },
      };
      const aborted = () =>
        listener.reject(
          new BridgeError(
            503,
            "No live Insight capture source is available on the host-selected OpenCode. Check the capture plugin and use the same backend machine.",
          ),
        );
      waiting.add(listener);
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
      else listener.notify();
    });
  }

  function confirmation(source: Source, nonce: string, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        receipts.delete(nonce);
        signal.removeEventListener("abort", aborted);
      };
      const receipt = {
        source,
        resolve() {
          cleanup();
          resolve();
        },
        reject(error: Error) {
          cleanup();
          reject(error);
        },
      };
      const aborted = () =>
        receipt.reject(
          new BridgeError(502, "The selected OpenCode did not confirm this telemetry read."),
        );
      receipts.set(nonce, receipt);
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }

  async function localQuery(
    source: Source,
    method: string,
    input: unknown,
    nonce: string,
    signal: AbortSignal,
  ) {
    return fetch(`http://127.0.0.1:${source.port}/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${source.token}`, "content-type": "application/json" },
      body: JSON.stringify({ method, input, nonce }),
      redirect: "error",
      signal,
    });
  }

  async function route(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.startsWith("/api/rpc/opencode-insight/"))
      return fetch(request);
    const body = z.object({ input: z.unknown() }).parse(await request.json());
    const query = hostQuerySchema.parse({
      method: url.pathname.slice("/api/rpc/opencode-insight/".length),
      input: body.input,
      nonce: randomUUID(),
    });
    const directory = url.searchParams.get("location[directory]");
    if (!directory) throw new BridgeError(400, "An Insight project directory is required.");
    const owner = stream;
    const source = await sourceFor(directory, request.signal);
    await verifySource(source, query.input, request.signal);
    if (stream !== owner) throw new BridgeError(409, "The host-selected telemetry source changed.");
    const response = await localQuery(
      source,
      query.method,
      query.input,
      query.nonce,
      request.signal,
    );
    const text = await response.text();
    if (!response.ok) throw new BridgeError(502, "The local Insight capture query failed.");
    if (stream !== owner) throw new BridgeError(409, "The host-selected telemetry source changed.");
    await verifySource(source, query.input, request.signal);
    if (stream !== owner) throw new BridgeError(409, "The host-selected telemetry source changed.");
    return new Response(text, { headers: { "content-type": "application/json" } });
  }

  async function verifySource(source: Source, input: unknown, signal: AbortSignal) {
    const nonce = randomUUID();
    const confirmed = confirmation(source, nonce, signal);
    try {
      await Promise.all([
        confirmed,
        (async () => {
          const verification = await localQuery(source, "speedScope", input, nonce, signal);
          await verification.body?.cancel();
          if (!verification.ok) throw new Error("The capture source could not verify the read.");
        })(),
      ]);
    } catch {
      receipts
        .get(nonce)
        ?.reject(
          new BridgeError(502, "The selected OpenCode did not confirm this telemetry read."),
        );
      await confirmed.catch(() => {});
      throw new BridgeError(502, "The selected OpenCode did not confirm this telemetry read.");
    }
  }

  return {
    query: createBridge(async () => {
      const connection = await connect();
      ensureStream(connection);
      return { ...connection, fetch: route };
    }),
    close() {
      closed = true;
      interrupt(new BridgeError(503, "The Insight bridge is closed."));
    },
  };
}
