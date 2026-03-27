import fs from "node:fs";
import path from "node:path";
import pino, { type MultiStreamRes } from "pino";

interface LogEntry {
  time: number;
  level: number;
  levelLabel: string;
  msg: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

const MAX_MEMORY_LOGS = 500;
const memoryLogs: LogEntry[] = [];

class MemoryStream {
  write(chunk: string): void {
    try {
      const parsed = JSON.parse(chunk) as LogEntry;
      const entry: LogEntry = {
        ...parsed,
        levelLabel: LOG_LEVELS[parsed.level] ?? "info",
      };
      memoryLogs.push(entry);
      if (memoryLogs.length > MAX_MEMORY_LOGS) {
        memoryLogs.shift();
      }
    } catch {
      // Ignore parse errors
    }
  }
}

function getLogDir(): string {
  const baseDir = process.env.LOG_DIR;
  if (baseDir) {
    return path.resolve(baseDir);
  }
  const cwd = process.cwd();
  return path.join(cwd, "logs");
}

function createFileStream(): MultiStreamRes | null {
  const logDir = getLogDir();
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    return pino.multistream([
      {
        level: "debug",
        stream: new MemoryStream(),
      },
      {
        level: "info",
        stream: pino.transport({
          target: "pino-roll",
          options: {
            file: path.join(logDir, "bff"),
            frequency: "daily",
            dateFormat: "yyyy-MM-dd",
            extension: ".log",
            mkdir: true,
            size: "10m",
            limit: { count: 7 },
          },
        }),
      },
    ]);
  } catch {
    return null;
  }
}

function createDevelopmentStream(): MultiStreamRes {
  return pino.multistream([
    {
      level: "debug",
      stream: new MemoryStream(),
    },
    {
      level: "info",
      stream: pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }),
    },
  ]);
}

const isProduction = process.env.NODE_ENV === "production";
const stream = isProduction ? createFileStream() : createDevelopmentStream();

const logger = stream
  ? pino({ level: process.env.LOG_LEVEL ?? "info" }, stream)
  : pino({ level: process.env.LOG_LEVEL ?? "info" });

export function getMemoryLogs(options?: {
  level?: string;
  limit?: number;
  search?: string;
}): LogEntry[] {
  let result = [...memoryLogs];

  if (options?.level) {
    const targetLevel = options.level.toLowerCase();
    result = result.filter((log) => log.levelLabel === targetLevel);
  }

  if (options?.search) {
    const searchLower = options.search.toLowerCase();
    result = result.filter(
      (log) =>
        log.msg.toLowerCase().includes(searchLower) ||
        JSON.stringify(log).toLowerCase().includes(searchLower),
    );
  }

  if (options?.limit && options.limit > 0) {
    result = result.slice(-options.limit);
  }

  return result;
}

export function clearMemoryLogs(): void {
  memoryLogs.length = 0;
}

export function getMemoryLogsStats(): {
  count: number;
  maxSize: number;
  oldestTime: number | null;
  newestTime: number | null;
} {
  return {
    count: memoryLogs.length,
    maxSize: MAX_MEMORY_LOGS,
    oldestTime: memoryLogs.length > 0 ? memoryLogs[0].time : null,
    newestTime: memoryLogs.length > 0 ? memoryLogs[memoryLogs.length - 1].time : null,
  };
}

export { logger };
export type { LogEntry };
