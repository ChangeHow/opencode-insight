import { randomUUID } from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import { delay } from "./runtime.mjs";

export async function provider() {
  let counts;
  let error;
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url !== "/v1/chat/completions") {
        response.writeHead(404);
        response.end();
        return;
      }
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      counts.requests++;
      counts.requestBytes += Buffer.byteLength(raw);
      const toolResult = body.messages.at(-1)?.role === "tool";
      const user = body.messages.findLast((message) => message.role === "user");
      const seed = JSON.stringify(user?.content).match(/MEMTEST_(?:LONG_)?\d+/)?.[0] ?? "MEMTEST_0";
      const common = {
        id: "chatcmpl-" + randomUUID(),
        object: "chat.completion.chunk",
        created: 1700000000,
        model: "fixture",
      };
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const send = (delta, finish_reason = null) =>
        response.write(
          `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
        );
      send({ role: "assistant", content: "" });
      if (!toolResult) {
        counts.tools++;
        send({
          tool_calls: [
            {
              index: 0,
              id: "call_" + randomUUID().replaceAll("-", ""),
              type: "function",
              function: { name: "memory_fixture", arguments: JSON.stringify({ seed }) },
            },
          ],
        });
        send({}, "tool_calls");
      } else {
        const bytes = seed.includes("LONG") ? 61440 : 4096;
        const text = `Completed ${seed}. Controlled output with no account access.\n`
          .repeat(2048)
          .slice(0, bytes);
        for (let offset = 0; offset < text.length; offset += 256) {
          send({ content: text.slice(offset, offset + 256) });
          counts.deltas++;
          await delay(1);
        }
        send({}, "stop");
      }
      response.write(
        `data: ${JSON.stringify({ ...common, choices: [], usage: { prompt_tokens: Math.ceil(raw.length / 4), completion_tokens: toolResult ? 1024 : 16, total_tokens: Math.ceil(raw.length / 4) + (toolResult ? 1024 : 16) } })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    } catch (caught) {
      error = String(caught.stack ?? caught);
      response.destroy(caught);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    reset() {
      error = undefined;
      counts = { requests: 0, tools: 0, deltas: 0, requestBytes: 0 };
      return counts;
    },
    assertHealthy() {
      if (error) throw new Error(error);
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
