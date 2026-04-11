import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "./neon.adapter.js";
import { applicationLogs } from "../schemas/drizzle.schema.js";

// ── Legacy logger (unchanged) ───────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

const isProduction = process.env.SST_STAGE === "production";

export function log(
  level: LogLevel,
  message: string,
  extras?: Record<string, unknown>,
): void {
  if (level === "debug" && isProduction) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extras,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

// ── Application Logger SDK ──────────────────────────────────────────────────

export interface LogRow {
  timestamp: Date;
  requestId: string | null;
  level: string;
  message: string;
  source: string;
  attributes: Record<string, unknown> | null;
  errorStack: string | null;
}

export interface LogContext {
  requestId: string;
  buffer: LogRow[];
}

export const logStore = new AsyncLocalStorage<LogContext>();

interface LogEntry {
  source: string;
  attributes?: Record<string, unknown>;
  error?: Error;
}

function pushLog(level: string, message: string, entry: LogEntry): void {
  const ctx = logStore.getStore();
  const row: LogRow = {
    timestamp: new Date(),
    requestId: ctx?.requestId ?? null,
    level,
    message,
    source: entry.source,
    attributes: entry.attributes ?? null,
    errorStack: entry.error?.stack ?? null,
  };

  if (ctx) {
    ctx.buffer.push(row);
  }
}

export const logger = {
  info(message: string, entry: LogEntry): void {
    pushLog("info", message, entry);
  },
  warn(message: string, entry: LogEntry): void {
    pushLog("warn", message, entry);
  },
  error(message: string, entry: LogEntry): void {
    pushLog("error", message, entry);
  },
};

export async function flushLogBuffer(buffer: LogRow[]): Promise<void> {
  if (buffer.length === 0) return;

  try {
    const db = getDb();
    await db.insert(applicationLogs).values(
      buffer.map((row) => ({
        timestamp: row.timestamp,
        requestId: row.requestId,
        level: row.level,
        message: row.message,
        source: row.source,
        attributes: row.attributes,
        errorStack: row.errorStack,
      })),
    );
  } catch {
    // Silently swallow — no stdout fallback per spec
  }
}

export async function writeApplicationLog(
  level: LogLevel,
  message: string,
  entry: LogEntry,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(applicationLogs).values({
      timestamp: new Date(),
      requestId: null,
      level,
      message,
      source: entry.source,
      attributes: entry.attributes ?? null,
      errorStack: entry.error?.stack ?? null,
    });
  } catch {
    // Silently swallow — no stdout fallback per spec
  }
}
