import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { loadEnv } = vi.hoisted(() => ({
  loadEnv: vi.fn(() => ({ parsed: {} })),
}));

vi.mock("dotenv", () => ({ config: loadEnv }));

import { loadEnvironment } from "../env";

describe("environment loading", () => {
  const originalEnvPath = process.env.OPENDASH_ENV;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loadEnv.mockClear();
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalEnvPath === undefined) {
      delete process.env.OPENDASH_ENV;
    } else {
      process.env.OPENDASH_ENV = originalEnvPath;
    }
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test("loads the OPENDASH_ENV file and reports its resolved path", () => {
    process.env.OPENDASH_ENV = ".env.project";

    loadEnvironment();

    const envPath = `${process.cwd()}/.env.project`;
    expect(loadEnv).toHaveBeenCalledWith({ path: envPath, quiet: true });
    expect(infoSpy).toHaveBeenCalledWith(`OPENDASH_ENV loaded: ${envPath}`);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("warns when the OPENDASH_ENV file cannot be loaded", () => {
    process.env.OPENDASH_ENV = ".env.missing";
    loadEnv.mockReturnValueOnce({ error: new Error("missing") });

    loadEnvironment();

    const envPath = `${process.cwd()}/.env.missing`;
    expect(warnSpy).toHaveBeenCalledWith(`OPENDASH_ENV could not be loaded: ${envPath}`);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
