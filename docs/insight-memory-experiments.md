# Selected result

The memory-oriented implementation is selected; the ASCII encoding fast path is
not included. Both long-idle comparisons used OpenCode 2.0.32 / embedded Bun
1.4.2, the same frozen full catalog, three load/idle cycles (168 fixture turns),
a connected SSE client, unchanged-panel polling, and 105 seconds of final natural
idle. No GC was forced between the measured load and these samples.

All values below are **total OpenCode server MiB**, not OpenChamber memory and not
plugin-only costs. Footprint, live JSC heap, and RSS are different measures.

| Comparison                 | Plugin              | Physical footprint | Live heap |    RSS |
| -------------------------- | ------------------- | -----------------: | --------: | -----: |
| Long idle                  | Off                 |              203.3 |     71.95 | 638.23 |
| Long idle                  | Reference `d599b56` |              248.5 |     88.39 | 783.44 |
| Long idle                  | Selected            |              201.3 |     77.39 | 752.98 |
| Reverse-order confirmation | Off                 |              200.3 |     71.84 | 616.14 |
| Reverse-order confirmation | Selected            |              200.4 |     77.45 | 748.34 |

The selected plugin adds approximately 5.4–5.6 MiB of live heap after idle; its
settled physical footprint is close to the no-plugin control in both observations.
Do not interpret small negative footprint differences as a real memory saving
over running without the plugin. All tracked session-detail objects and tokenizer
objects were naturally collected during the idle cycles. Full statistics hashes
also remained identical after idle recovery and ten native location reloads.

**RSS does not return to the no-plugin level:** it remains approximately
115–132 MiB higher in these comparisons. Raw `vmmap` summaries show substantial
empty/resident allocator regions. The actual physical footprint falls during idle,
but this is not evidence that RSS itself has returned to baseline or that every
possible project/workload is leak-free. The stopping judgment is based on natural
object reclamation and near-baseline settled physical memory pressure, not a claim
that plugin RSS overhead has disappeared.

The exact replay contract hash for the reference and selected implementations is
`1e519a3de1293a3dbcd61e6f44dc9d83fd0d376da21a48ea796242d8935054fc`.
The final 19 production source files match the frozen selected source byte for
byte. Public RPC/schema files and OpenChamber consumer/presentation files are
unchanged. Build, typecheck, formatting, 774 tests, daemon HTTP smoke, and native
extension/bridge/dashboard smoke passed; lint reports 0 errors and 11 existing
warnings. No production installation, managed service restart, or Git commit was
performed.

Raw experiment root:

```text
/private/var/folders/w3/wdx0702n4sn_82k5nhwz_rww0000gn/T/opencode/insight-server-matrix-uCljMC
```

In `idle-soak/results.json`, **`control` is the selected implementation** and
`candidate` is the rejected ASCII trial. In `selected-confirm/results.json`,
`candidate` is the selected implementation. Both include raw checkpoints,
footprint region summaries, exact replay outputs, source snapshots, and bundle
hashes. Earlier screens remain separate and must not be mixed into the table.

# Contract and scope

Optimize the OpenCode server collector without changing the `opencode-insight`
RPC definition, response schemas, field values, array ordering, token estimation,
revision semantics, capture limits, persistence timing, or failure isolation.
OpenChamber consumers and presentation code are outside this experiment.

The reference is a frozen Git revision, initially `d599b56`. Each candidate is a
separate built plugin directory, not a production feature flag. Never load several
collectors with the same RPC ID in one server. Every run uses fresh HOME/XDG
directories, a private loopback listener, generated authentication, a local model
fixture, and no real account credentials or managed service changes.

Run the contract gate first, then a balanced short matrix in a new output directory:

```bash
pnpm bench:insight-memory --baseline=d599b56 --out=/absolute/new/replay --replay-only
pnpm bench:insight-memory --baseline=d599b56 --out=/absolute/new/screen --repeats=2
node scripts/insight-memory/report.mjs /absolute/new/screen
```

The confirmation harness freezes both the Git baseline and the complete working
candidate before starting. Its native arms are `off`, `baseline`, and `candidate`;
`queue` is a narrow baseline ablation for the response-retention diagnosis. An
optional `control` arm with `--control=/previous/output/candidate-source` compares
one new optimization against a previously frozen candidate without rebuilding
that control from the current working tree. The
earlier nine-arm screening bundles retain their own frozen sources and hashes in
the experiment artifacts; they are not reconstructed by mixing current files.

The default native workload has 40 growing-conversation turns, 96 additional
sessions, four concurrent long-output sessions, 100 pairs of full session/series
queries, and ten seconds of idle. Provider responses are streamed 256 characters
at a time; normal output is 4,096 characters and long output is 61,440. All sizes
are controlled synthetic data, not user transcripts.

The default `--poll-mode=stress` deliberately queries complete snapshots even at
unchanged revisions. Also run `--poll-mode=panel`: the existing OpenChamber
controller reads a full snapshot initially and thereafter only when the series
revision changes. Never mix these workload profiles in one comparison or call
the stress profile representative of normal unchanged panel polling.

`--event-client` keeps an additional public SSE client connected in every arm,
including `off`. This models a connected frontend independently of the collector
and separates first-subscriber transport initialization from the plugin's
incremental cost. The driver drains bytes without retaining event payloads.
Report this scenario separately from a server with no external event subscriber.

On macOS, `--vmmap` records a post-idle `vmmap -summary` diagnostic before the
forced collection. Physical footprint is a separate OS memory-pressure measure,
not RSS or live JavaScript heap. Preserve the raw region summary; report
unavailable diagnostics rather than inventing a value when access is denied.

Confirm with additional repetitions and natural idle polling. Do not force GC
before the natural idle observation:

```bash
pnpm bench:insight-memory --baseline=d599b56 --out=/absolute/new/confirm --variants=off,baseline,candidate --repeats=3 --idle=60 --idle-poll
pnpm bench:insight-memory --baseline=d599b56 --out=/absolute/new/queue --variants=baseline,queue --repeats=1 --turns=40 --sessions=1 --polls=1 --idle=2 --retention-probe
```

The selected implementation is also checked with repeated activity and natural
long idle while a frontend remains connected:

```bash
pnpm bench:insight-memory --baseline=d599b56 --out=/absolute/new/idle --variants=off,baseline,candidate --repeats=1 --cycles=3 --turns=20 --sessions=32 --polls=20 --idle=15 --soak=90 --event-client --poll-mode=panel --idle-poll --vmmap
```

The baseline always participates in the deterministic gate, including when it is
not selected for native measurements. Never reuse an output directory: that
would contaminate the fresh-state comparison. Bundles, exact replay output,
per-process samples, operation counts, and raw results are retained in that
directory. Use `report.mjs` to produce median/range summaries.

# Falsifiable candidates

| Candidate     | Hypothesis                                                                                               | Expected signal                                        | Compatibility requirement                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `persistence` | Full JSON round trips before storage create avoidable allocation pressure.                               | Lower RSS/CPU with unchanged write count.              | Detached persisted JSON, identical content and write boundaries.                                       |
| `stream`      | Full accepted stream bodies and repeated BPE work are unnecessary after the sampling prefix is full.     | Lower retained stream data and CPU on long output.     | Identical request after every delta, including negative corrections and limits.                        |
| `provenance`  | Tool continuations repeatedly reconstruct the complete native transcript only to recover skill metadata. | Fewer native context reads without larger body caches. | Native skill identity, spoof protection, restart seeding, and uncertain-cache fallback remain correct. |
| `combined`    | Independent successful candidates compose without data differences.                                      | Combined benefit rather than an assumed sum.           | Must pass the same gates independently.                                                                |

`off` measures OpenCode and fixture overhead; `baseline` measures the frozen
collector. Single candidates are compared against `baseline`, not only against
each other. Internal implementations that do not pass equivalence are rejected
regardless of their memory result.

The second stage adds three independently built candidates:

- `borrowed`: lend the known JSON-safe collector view to an awaited storage write
  while the mutation queue is held. A native integration gate must first prove
  that settled storage writes own their values. No private storage format changes.
- `rpc`: remove duplicate private validation while copying inside the queue; keep
  the unchanged RPC output schemas. A deliberately invalid Zod response must still
  be rejected by the native host.
- `tokenizer`: convert each UTF-8 piece to a byte string once, then slice it for
  BPE pair lookups instead of repeatedly creating typed-array views and spreading
  them. No token rules or sampling limits change.

The second-stage combination was
`stream,provenance,borrowed,rpc,tokenizer`. Each direction and the combined bundle
were built independently from the same frozen reference. Copy-persistence and
borrowed-persistence were mutually exclusive. The bundle hashes are recorded,
not inferred from a name. No runtime switches are shipped in the plugin.

The third stage adds idle ownership fixes:

- A fulfilled serialization tail must retain only `undefined`, not the last RPC
  response. A weak-reference probe verifies release without retaining the object.
- Persisted, quiescent session detail can leave the memory cache after five seconds.
  Active requests, active/background tools, pending context, and never-persisted
  data cannot be discarded. Complete statistics remain on disk and reload exactly.
- A bounded revision-only index serves unchanged polling without reloading detail.
  Every RPC still verifies native session existence and location before using it.
- Reconnect/cleanup cancels timers, flushes first, and releases recoverable
  detail immediately. Pending context and never-persisted data stay protected.
  Reusing the collector after reconnect must restart periodic persistence.
- The lazy tokenizer releases its rank map after five seconds without tokenization.
  Activity is tracked in the shared tokenizer module, not one project instance.
  The next observation rebuilds the same table without changing any token counts.
- Native durable inbox admission proves ordinary user message IDs only when no
  skills are attached; native step-start events prove assistant IDs. Keep these
  bounded, weak identity sets across prompts rather than clearing every prompt.
  Unknown IDs, attached skills (including unresolved attachments), and uncertain
  event ordering still fall back to a complete native context read. No message
  bodies or fingerprints are cached, and prompt drafts are never authoritative.
- A compact vocabulary byte arena replaces per-token JavaScript strings and Map
  entries. Open-address lookups compare full bytes on collisions; hash equality
  alone never establishes token identity. The complete vocabulary and BPE outputs
  must match the pinned reference.
- Synchronous BPE merge work reuses three numeric index arrays instead of
  allocating three typed arrays and backing buffers per unmatched text piece.
  Active positions are reset on every call, capacity never changes loop bounds,
  and idle release also drops the workspace. Input strings and input bytes are
  not retained in this workspace.
- An ASCII encoding fast path was tested but not selected. It reduced CPU time
  and latency in the paired screen, but produced higher RSS there and a higher
  settled physical footprint in the long idle comparison. Keep it only in the
  frozen experimental artifacts, not in the final memory-oriented implementation.
- A shallow-only undefined-field persistence walk was tested and rejected: CPU
  did not improve, and its RSS was worse in the paired screen. Keep the simpler
  recursive borrowed view; the native settled-write ownership prerequisite
  remains mandatory. Do not adopt an optimization from source reasoning alone.

# Unified correctness gate

Replay a deterministic trace through the actual built plugin entrypoint. Fix
message IDs, event timestamps, model responses, and the logical clock; do not
normalize away fields that might conceal a change. Compare complete session and
series JSON at intermediate checkpoints, unchanged-revision responses, errors,
persisted snapshots, and restored snapshots. Property order is immaterial, but
array order and all values are preserved.

The trace covers attached and dynamically activated skills, spoofed wrappers,
tool continuations, nested/background tool metadata, visible/summary reasoning,
interruption, JSON omission, storage recovery, long streaming boundaries, idle
eviction, unchanged polling, and resumed capture after tokenizer reinitialization.
Targeted unit tests retain the existing scope/privacy/detachment contracts.

# Native server experiment

All eligible bundles are loaded by the same installed OpenCode binary, one server
at a time. A fixture plugin shared by every arm reports PID, RSS, JSC heap,
external memory, CPU time, and collector operation counts. Counters must not
serialize payloads or retain event bodies. Driver measurements include request
latencies and process RSS samples. Metric collection is identical across arms.

Use reversed pairs with rotated blocks and fresh state per run. The short workload includes
a growing conversation, more sessions than the 64-session memory cache, long
streams, concurrent sessions, and repeated RPC queries. Keep output sizes, turn
counts, query counts, and idle duration identical. Live timestamps naturally
differ between runs; exact content equivalence is established by deterministic
replay, not by deleting timing fields from live results.

The confirmation protocol freezes one complete public model catalog per matrix
and passes `OPENCODE_MODELS_PATH` plus `OPENCODE_DISABLE_MODELS_FETCH=1` only to
isolated children. These V2 launch options were verified in CLI source and the
installed binary. This prevents asynchronous catalog refresh from contaminating
RSS attribution. Every child completes one unmeasured model/tool turn followed
by the same settling interval and initial diagnostic GC. No GC is forced during
the measured workload; the final post-GC checkpoint is reported separately.

The provenance candidate never caches attachment bodies or replaces their exact
text comparison with hash equality. Captures with native attachments deliberately
re-read them; identifierless assembled parts do not use native provenance at all.
Known message identities are bounded and weakly owned by the collector session.

CPU profiling uses the documented `SIGPROF` mechanism on an isolated child, not
the managed service. Profiled runs are diagnostic only: profiling itself can
increase memory and CPU, so never include them in a ranking matrix.

Separate natural-GC measurements from diagnostic post-GC checkpoints. Report
total RSS and excess above `off`, observed peaks, final retained heap, CPU,
latency, and raw per-run values. Use medians and ranges; a short noisy RSS sample
is not proof of a leak or a significant performance gain.

After screening, repeat the baseline and selected combination and run an idle /
reload soak. `--cycles=3` repeats the complete load/idle sequence in one child,
resuming the growing conversation without intermediate forced collections.
`--soak=300 --idle-poll` extends natural idle observation; diagnostic GC runs only
after it. With `--vmmap`, record physical footprint every 30 seconds and at the
end of the soak to distinguish delayed allocator reclamation from retained
objects. Ten native location reloads follow the observation and must preserve
the complete statistics digest. Compare heap ownership and excess over `off`, not
only the post-GC heap, and test cleanup. Do not introduce
explicit GC into the production plugin, lower capture retention, or change
durability solely to improve a benchmark.

# Selection and delivery

Retain candidates with reproducible memory or CPU benefit and no contract
difference. Reject regressions, excessive metadata/body caches, and speculative
fallback paths that cannot be verified. Re-test the final composition; remove
losing experimental production code rather than shipping switches.

Run the repository build, typecheck, lint, formatting, tests, daemon smoke, and
native extension smoke before handoff. Retain the plan, reproducible harness,
raw JSON results, bundle hashes, and explicit limitations. Stop every isolated
process. Do not publish, install into the main environment, or commit without a
separate request.
