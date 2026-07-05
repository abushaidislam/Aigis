// Structured server-side logger. One place to funnel every `console.error`
// on the SSR / edge worker path so we can:
//
//   1. Enforce a redaction pass (no bearer tokens, no ciphertext, no email
//      addresses) before anything reaches Cloudflare Logpush / Supabase
//      log drains.
//   2. Emit a stable JSON shape so downstream log ingest can group by
//      `event`, `route`, and `severity` without regex heroics.
//
// This is server-only. Do NOT import it from route files that ship to
// the client bundle. Import it from `*.server.ts`, request middleware,
// server functions, or `src/server.ts`.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  event: string;
  route?: string;
  request_id?: string;
  user_id?: string;
  duration_ms?: number;
  build_sha?: string;
  vault_crypto_version?: number;
  message?: string;
  stack?: string;
  // Any additional structured fields. Must be JSON-serialisable + already
  // redacted by the caller.
  extra?: Record<string, unknown>;
}

// Patterns we scrub from stringified payloads. Kept intentionally broad —
// we would rather over-redact than leak. If a legitimate log looks empty
// because of this, add a targeted field to LogEvent instead of loosening
// the regex.
const REDACT_PATTERNS: [RegExp, string][] = [
  // Bearer tokens (JWT-like).
  [/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{5,}/g, "[REDACTED_JWT]"],
  // sb_secret_… / sb_publishable_… — new Supabase API key style.
  [/sb_(?:secret|publishable)_[a-zA-Z0-9]{20,}/g, "[REDACTED_SB_KEY]"],
  // Email addresses.
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]"],
  // Long base32 blobs (>=20 chars) — likely TOTP seeds or wrapped keys.
  [/\b[A-Z2-7]{20,}={0,2}\b/g, "[REDACTED_BASE32]"],
  // "\x…" pg bytea hex literals of any material length.
  [/\\x[0-9a-fA-F]{16,}/g, "[REDACTED_BYTEA]"],
];

function redact(input: string): string {
  let out = input;
  for (const [re, replacement] of REDACT_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function emit(event: LogEvent): void {
  const record = {
    ts: new Date().toISOString(),
    ...event,
    // Redact after serialization so we catch things buried in `extra`.
  };
  try {
    const line = redact(JSON.stringify(record));
    if (event.level === "error") {
      // eslint-disable-next-line no-console -- server-side sink
      console.error(line);
    } else if (event.level === "warn") {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  } catch {
    // Structured logging must never itself throw.
  }
}

export const serverLog = {
  debug: (event: string, extra?: Omit<LogEvent, "level" | "event">) =>
    emit({ level: "debug", event, ...extra }),
  info: (event: string, extra?: Omit<LogEvent, "level" | "event">) =>
    emit({ level: "info", event, ...extra }),
  warn: (event: string, extra?: Omit<LogEvent, "level" | "event">) =>
    emit({ level: "warn", event, ...extra }),
  error: (event: string, err: unknown, extra?: Omit<LogEvent, "level" | "event" | "message" | "stack">) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : undefined;
    emit({ level: "error", event, message, stack, ...extra });
  },
};

/** Small helper: derive `route` from a Request URL for uniform tagging. */
export function routeOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "unknown";
  }
}
