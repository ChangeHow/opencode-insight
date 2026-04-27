import os from "node:os";
import path from "node:path";

export const SYNC_CACHE_DIR = path.join(os.homedir(), ".opencode-token-dashboard");
export const MACHINE_ID_FILE = path.join(SYNC_CACHE_DIR, "machine-id");
export const PUSH_STATE_FILE = path.join(SYNC_CACHE_DIR, "sync-push-state.json");
export const REMOTE_CACHE_FILE = path.join(SYNC_CACHE_DIR, "remote-usage-cache.json");
