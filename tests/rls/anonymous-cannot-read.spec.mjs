// RLS smoke test: prove that a truly anonymous PostgREST client cannot
// SELECT anything from user-owned tables, and that the admin-gated
// tables (`client_errors`, `admin_audit`) also return nothing to an
// anonymous caller.
//
// This is the CI counterpart of the zero-knowledge invariant in
// SECURITY.md — it's cheaper than reviewing every future migration by
// hand.
//
// It uses the `anon` publishable key (from .env) which every browser tab
// already ships with, i.e. it exercises exactly the surface an attacker
// could hit from `curl` without any credentials.
//
// Run:   node tests/rls/anonymous-cannot-read.spec.mjs
// Exit:  0 on success, 1 on any leak.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  // Merge process.env with a plain .env parser so this test works both in
  // CI (env vars) and locally (dotfile only).
  const merged = { ...process.env };
  try {
    const raw = readFileSync(resolve(HERE, "..", "..", ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && merged[m[1]] == null) merged[m[1]] = m[2];
    }
  } catch {
    /* ignore — env may come from process.env only */
  }
  return merged;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON_KEY = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    "[rls] SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (via .env or CI env)",
  );
  process.exit(1);
}

// Tables that must return an empty array to an anonymous caller.
// Every user-owned table lives here; every admin-only table lives here.
const FORBIDDEN_TABLES = [
  // User-owned tables — RLS filters by auth.uid() = user_id.
  "profiles",
  "vault_meta",
  "vault_accounts",

  // Admin-only tables — RLS filters by public.is_admin().
  "client_errors",
  "admin_audit",
];

// Tables that authenticated users CAN read but that an *anonymous* caller
// still must not see. Feature flags and live announcements are read by
// signed-in users; anon must get []. RLS for `authenticated` role +
// no policy for `anon` = empty result.
const AUTH_ONLY_READABLE_TABLES = [
  "feature_flags",
  "announcements",
];

async function selectAll(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      // Explicitly no Authorization header — we are anonymous.
      Accept: "application/json",
    },
  });
  return { status: res.status, body: await res.text() };
}

function assertEmpty(table, { status, body }) {
  // We accept either:
  //   200 + "[]"                       (RLS silently filtered — expected)
  //   401 / 403 with a JSON error body (some tables set REVOKE on anon)
  // Anything else is a leak.
  if (status === 200) {
    assert.equal(body.trim(), "[]", `${table}: leaked rows for anonymous caller — body=${body.slice(0, 200)}`);
    return;
  }
  assert.ok(
    status === 401 || status === 403 || status === 404,
    `${table}: unexpected status ${status} — body=${body.slice(0, 200)}`,
  );
}

async function main() {
  console.log("[rls] target:", SUPABASE_URL);

  let passed = 0;
  for (const table of [...FORBIDDEN_TABLES, ...AUTH_ONLY_READABLE_TABLES]) {
    const result = await selectAll(table);
    assertEmpty(table, result);
    console.log(`[rls] ${table.padEnd(20)} → ${result.status} ✓`);
    passed++;
  }

  console.log(`[rls] OK — ${passed}/${passed} tables refused anonymous reads.`);
}

main().catch((err) => {
  console.error("[rls] FAIL:", err);
  process.exit(1);
});
