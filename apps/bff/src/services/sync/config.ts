import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { MACHINE_ID_FILE, SYNC_CACHE_DIR } from "./paths";

function readMachineId() {
  if (fs.existsSync(MACHINE_ID_FILE)) {
    const value = fs.readFileSync(MACHINE_ID_FILE, "utf8").trim();
    if (value.length > 0) {
      return value;
    }
  }

  fs.mkdirSync(SYNC_CACHE_DIR, { recursive: true });
  const value = crypto.randomUUID();
  fs.writeFileSync(MACHINE_ID_FILE, value, "utf8");
  return value;
}

function normalizeEndpoint(value: string | undefined) {
  const endpoint = value?.trim();
  return endpoint && endpoint.length > 0 ? endpoint.replace(/\/$/, "") : null;
}

export function getSyncConfig() {
  const endpoint = normalizeEndpoint(process.env.SYNC_ENDPOINT);
  const token = process.env.SYNC_TOKEN?.trim() || null;
  const enabled = Boolean(endpoint && token);
  return {
    enabled,
    endpoint,
    token,
    machine: {
      id: process.env.SYNC_MACHINE_ID?.trim() || (enabled ? readMachineId() : "local"),
      label: process.env.SYNC_MACHINE_LABEL?.trim() || os.hostname() || "Unknown machine",
    },
  };
}
