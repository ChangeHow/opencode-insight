import { Plugin } from "@opencode/plugin";
import { Rpc } from "@opencode/plugin/rpc";
import { heapStats } from "bun:jsc";
import { z } from "zod";

const Probe = Rpc.define({
  id: "insight-memory-probe",
  methods: {
    ownership: {
      input: { type: "object", additionalProperties: false },
      output: {
        type: "object",
        properties: { detached: { type: "boolean" } },
        required: ["detached"],
      },
    },
    validation: {
      input: { type: "object", additionalProperties: false },
      output: z.object({ valid: z.boolean() }),
    },
    metrics: {
      input: { type: "object", properties: { gc: { type: "boolean" } }, required: ["gc"] },
      output: { type: "object", additionalProperties: true },
    },
  },
  events: {},
});

export default Plugin.define({
  id: "insight-memory-probe",
  async setup(ctx) {
    let toolCalls = 0;
    const registrations = [
      await ctx.session.hook("title", (event) => {
        event.result = "Memory fixture";
      }),
    ];
    registrations.push(
      await ctx.tool.transform((editor) => {
        for (const tool of editor.list()) editor.remove(tool.id);
        editor.add({
          name: "memory_fixture",
          description: "Return a deterministic local telemetry workload.",
          input: { type: "object", properties: { seed: { type: "string" } }, required: ["seed"] },
          options: { codemode: false },
          async execute(input) {
            toolCalls++;
            return {
              content: `Tool result ${input.seed}: controlled payload.\n`
                .repeat(256)
                .slice(0, 8192),
            };
          },
        });
      }),
    );
    registrations.push(
      await ctx.rpc.register(Probe, {
        async ownership() {
          const value = { nested: { count: 1 }, entries: ["original"] };
          await ctx.storage.set("ownership-probe", value);
          value.nested.count = 2;
          value.entries.push("changed");
          const stored = await ctx.storage.get("ownership-probe");
          await ctx.storage.remove("ownership-probe");
          return { detached: stored.nested.count === 1 && stored.entries.length === 1 };
        },
        async validation() {
          return { valid: "deliberately-invalid-fixture" };
        },
        async metrics(input) {
          if (input.gc) {
            Bun.gc(true);
            await new Promise((resolve) => setTimeout(resolve, 50));
            Bun.gc(true);
          }
          const heap = heapStats();
          return {
            pid: process.pid,
            versions: process.versions,
            toolCalls,
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            heap: {
              heapSize: heap.heapSize,
              heapCapacity: heap.heapCapacity,
              extraMemorySize: heap.extraMemorySize,
              objectCount: heap.objectCount,
              protectedObjectCount: heap.protectedObjectCount,
            },
            operations: globalThis[Symbol.for("insight-memory.operations")] ?? {},
            lastSnapshotAlive:
              globalThis[Symbol.for("insight-memory.last-snapshot")]?.deref() !== undefined,
            sessionObjectsAlive: [
              ...(globalThis[Symbol.for("insight-memory.session-refs")]?.values() ?? []),
            ].filter((ref) => ref.deref() !== undefined).length,
            tokenizerAlive:
              globalThis[Symbol.for("insight-memory.rank-ref")]?.deref() !== undefined,
          };
        },
      }),
    );
    return async () => {
      for (const registration of registrations.reverse()) await registration.dispose();
    };
  },
});
