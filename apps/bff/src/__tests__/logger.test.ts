import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const pinoMock = vi.fn((options, stream) => ({ options, stream }));
const transportMock = vi.fn((options) => ({ options }));
const multistreamMock = vi.fn((streams) => ({ streams }));

vi.mock("pino", () => {
  const pino = Object.assign(pinoMock, {
    multistream: multistreamMock,
    transport: transportMock,
  });

  return { default: pino };
});

describe("logger", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("uses single-line pretty output in daemon mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.DAEMON_MODE = "1";

    await import("../logger");

    expect(transportMock).toHaveBeenCalledWith({
      target: "pino-pretty",
      options: expect.objectContaining({
        colorize: false,
        ignore: "pid,hostname",
        singleLine: true,
        translateTime: "SYS:standard",
      }),
    });
    expect(multistreamMock).toHaveBeenCalled();
    expect(pinoMock).toHaveBeenCalled();
  });
});
