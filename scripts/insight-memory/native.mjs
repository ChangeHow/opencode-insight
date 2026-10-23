import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { delay, server } from "./runtime.mjs";

export async function nativeRun(
  root,
  bundle,
  probe,
  provider,
  workload,
  soakSeconds = 0,
  catalog,
  profile = false,
) {
  await mkdir(root, { recursive: true });
  let counts = provider.reset();
  const host = await server(
    root,
    [probe, ...(bundle ? [bundle.directory] : [])],
    provider.url,
    catalog,
  );
  const result = {
    pid: host.child.pid,
    counts,
    checkpoints: [],
    rssSamples: [],
    turnLatencies: [],
    rpcLatencies: [],
    enabled: !!bundle,
  };
  let phase = "loaded";
  let profileAt;
  let eventObserver;
  const started = performance.now();
  const sampler = setInterval(
    () => result.rssSamples.push({ phase, ms: performance.now() - started, rss: host.rss() }),
    500,
  );
  const metrics = (gc) => host.rpc("insight-memory-probe", "metrics", { gc });
  const rpc = async (method, input) => {
    const at = performance.now();
    const value = await host.rpc("opencode-insight", method, input);
    result.rpcLatencies.push(performance.now() - at);
    return value;
  };
  const memoryMap = async (label) => {
    if (!workload.vmmap) return;
    const map = host.memoryMap();
    const value = { label, status: map.status, error: map.error?.message };
    const footprint = map.stdout?.match(/^Physical footprint:\s+([\d.]+)([KMG]?)/m);
    if (map.status === 0 && footprint) {
      const scale = { "": 1, K: 1024, M: 1048576, G: 1073741824 }[footprint[2]];
      value.physicalFootprint = Number(footprint[1]) * scale;
    }
    (result.footprints ??= []).push(value);
    if (label === "natural-final") result.vmmap = value;
    const file = label === "natural-final" ? "vmmap-summary.txt" : `vmmap-${label}.txt`;
    await writeFile(path.join(root, file), `${map.stdout ?? ""}${map.stderr ?? ""}`);
  };
  const checkpoint = async (label, gc = false) => {
    const value = await metrics(gc);
    if (value.pid !== host.child.pid) throw new Error("Metrics belong to another process");
    const point = {
      label,
      ms: performance.now() - started,
      rss: host.rss(),
      ...value,
      counts: { ...counts },
    };
    result.checkpoints.push(point);
    console.log(
      JSON.stringify({
        label,
        rssMiB: +(point.rss / 1048576).toFixed(1),
        heapMiB: +(point.heap.heapSize / 1048576).toFixed(1),
        operations: point.operations,
      }),
    );
    return point;
  };
  const createSession = async (title) =>
    (
      await host.request("/api/session", {
        location: { directory: host.project },
        title,
        model: { providerID: "memory-fixture", id: "fixture" },
      })
    ).data.id;
  let turn = 0;
  const prompt = async (sessionID, long = false) => {
    const at = performance.now();
    await host.request(`/api/session/${sessionID}/prompt`, {
      text:
        `MEMTEST_${long ? "LONG_" : ""}${++turn} Call the local fixture and finish.\n` +
        "Controlled user context. ".repeat(80),
    });
    await host.request(`/api/experimental/session/${sessionID}/wait`, {});
    provider.assertHealthy();
    result.turnLatencies.push(performance.now() - at);
  };
  try {
    result.serverInfo = await host.request("/api/info");
    if (workload.eventClient) eventObserver = await host.observeEvents();
    result.storageOwnership = await host.rpc("insight-memory-probe", "ownership", {});
    if (!result.storageOwnership.detached)
      throw new Error("Host storage does not own settled writes");
    try {
      await host.rpc("insight-memory-probe", "validation", {});
      throw new Error("Host accepted an invalid RPC output");
    } catch (error) {
      if (!error.message.includes("HTTP 500")) throw error;
      result.rpcOutputValidation = true;
    }
    const warmup = await createSession("Unmeasured warmup");
    await prompt(warmup);
    result.warmup = { ...counts };
    await delay(1000);
    counts = provider.reset();
    result.counts = counts;
    result.turnLatencies.length = 0;
    turn = 0;
    await checkpoint("loaded", true);
    if (profile) {
      host.child.kill("SIGPROF");
      profileAt = performance.now();
    }
    const growing = await createSession("Growing controlled conversation");
    let revision;
    for (let cycle = 0; cycle < workload.cycles; cycle++) {
      const stage = (label) => checkpoint(cycle ? `cycle-${cycle + 1}-${label}` : label);
      phase = "growing";
      for (let index = 0; index < workload.turns; index++) await prompt(growing);
      await stage("growing");
      phase = "sessions";
      let latest;
      for (let index = 0; index < workload.sessions; index++) {
        latest = await createSession(`Controlled session ${index}`);
        await prompt(latest);
      }
      await stage("sessions");
      phase = "concurrent-long-streams";
      const concurrent = await Promise.all(
        Array.from({ length: workload.concurrent }, (_, index) =>
          createSession(`Concurrent ${index}`),
        ),
      );
      await Promise.all(concurrent.map((id) => prompt(id, true)));
      await stage("long-streams");
      const expectedTurns =
        (workload.turns + workload.sessions + workload.concurrent) * (cycle + 1);
      if (counts.requests !== expectedTurns * 2 || counts.tools !== expectedTurns)
        throw new Error(`Workload changed: ${JSON.stringify(counts)}`);
      phase = "polling";
      if (bundle) {
        const capture = await rpc("session", { sessionID: latest });
        if (
          capture.requests.length !== 2 ||
          capture.tools.length !== 1 ||
          capture.requests.some((request) => request.status !== "completed")
        )
          throw new Error("Live request/tool capture was not preserved");
        const full = await rpc("session", { sessionID: growing });
        result.captureDigest = createHash("sha256").update(JSON.stringify(full)).digest("hex");
        revision = full.revision;
        result.captureProof = {
          requests: full.requests.length,
          tools: full.tools.length,
          sources: full.requests.reduce((sum, request) => sum + request.context.length, 0),
        };
        if (full.requests.length !== Math.min(512, workload.turns * 2 * (cycle + 1)))
          throw new Error("Growing conversation lost captured requests after idle");
        for (let index = 0; index < workload.polls; index++) {
          if (workload.pollMode === "stress") await rpc("session", { sessionID: growing });
          await rpc("series", { sessionID: growing, after: full.revision });
        }
        if (workload.lastSession) {
          // Let the last capture's flush timer finish before emulating an idle
          // historical-session query with no following collector operation.
          await delay(1500);
          await rpc("session", { sessionID: growing });
        }
      } else {
        for (let index = 0; index < workload.polls; index++)
          await host.request(`/api/session/${growing}`);
      }
      await stage("polling");
      phase = "idle";
      const idleUntil = performance.now() + workload.idleSeconds * 1000;
      let idlePolls = 0;
      while (performance.now() < idleUntil) {
        await delay(Math.min(1000, idleUntil - performance.now()));
        if (workload.idlePoll) {
          if (bundle) {
            const value = await rpc("series", { sessionID: growing, after: revision });
            if (value.revision !== revision || !value.unchanged || value.points.length)
              throw new Error("Idle polling changed the captured statistics");
          } else await host.request(`/api/session/${growing}`);
        }
        if ([1, 5, 10].includes(++idlePolls) || idlePolls % 15 === 0)
          await stage(`idle-${idlePolls}`);
      }
      result.idlePolls = (result.idlePolls ?? 0) + (workload.idlePoll ? idlePolls : 0);
      await stage("cycle-idle-final");
    }
    await checkpoint("natural-final");
    await memoryMap("natural-final");
    if (soakSeconds) {
      phase = "soak";
      const end = performance.now() + soakSeconds * 1000;
      let iteration = 0;
      while (performance.now() < end) {
        await delay(Math.min(1000, end - performance.now()));
        if (workload.idlePoll) {
          if (bundle) {
            const value = await rpc("series", { sessionID: growing, after: revision });
            if (value.revision !== revision || !value.unchanged || value.points.length)
              throw new Error("Soak polling changed the captured statistics");
          } else await host.request(`/api/session/${growing}`);
        }
        if (++iteration % 30 === 0) {
          await checkpoint(`soak-${iteration}`);
          await memoryMap(`soak-${iteration}`);
        }
      }
      await checkpoint("soak-final");
      await memoryMap("soak-final");
    }
    await checkpoint("post-gc", true);
    if (eventObserver) {
      eventObserver.assertHealthy();
      result.eventBytes = eventObserver.bytes;
      if (!result.eventBytes) throw new Error("External event observer received no data");
      await eventObserver.close();
      eventObserver = undefined;
    }
    let previous;
    if (bundle) {
      const value = await rpc("session", { sessionID: growing });
      previous = createHash("sha256").update(JSON.stringify(value)).digest("hex");
      if (previous !== result.captureDigest)
        throw new Error("Statistics changed during idle observation");
    }
    phase = "reloads";
    for (let index = 0; index < workload.reloads; index++) {
      await host.request("/api/location/reload", {});
      if (bundle) {
        const value = await rpc("session", { sessionID: growing });
        const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
        if (digest !== previous) throw new Error("Statistics changed after native location reload");
      }
    }
    result.reloadProof = { count: workload.reloads, identical: bundle ? true : null };
    await checkpoint("reloads-final", true);
    result.finished = true;
    if (profileAt) await delay(Math.max(0, 11000 - (performance.now() - profileAt)));
    return result;
  } finally {
    clearInterval(sampler);
    await eventObserver?.close();
    await host.close();
    result.stopped = true;
    await writeFile(path.join(root, "result.json"), JSON.stringify(result, null, 2));
  }
}
