import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultEnvPath = path.resolve(currentDir, "../../../.env.local");

export function loadEnvironment() {
  const configuredPath = process.env.OPENDASH_ENV?.trim();
  const envPath = configuredPath ? path.resolve(configuredPath) : defaultEnvPath;
  const result = loadEnv({ path: envPath, quiet: true });

  if (configuredPath) {
    const message = `OPENDASH_ENV ${result.error ? "could not be loaded" : "loaded"}: ${envPath}`;
    if (result.error) {
      console.warn(message);
    } else {
      console.info(message);
    }
  }
}

loadEnvironment();
