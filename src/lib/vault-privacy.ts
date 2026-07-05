// Privacy preference: when ON, TOTP codes are masked in the vault list
// and in the details modal until the user explicitly reveals them.
// Persisted per-user in localStorage; hydrated (best-effort) from the
// user's profile so the choice syncs across devices — the SAME pattern
// we use for auto-lock.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_HIDE = false;
const STORAGE_PREFIX = "aegis.hidecodes.";

let currentUserId: string | null = null;
let hideCodes: boolean = DEFAULT_HIDE;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function storageKey(userId: string) {
  return STORAGE_PREFIX + userId;
}

function loadLocal(userId: string): boolean {
  if (typeof window === "undefined") return DEFAULT_HIDE;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw === null) return DEFAULT_HIDE;
    return raw === "1";
  } catch {
    return DEFAULT_HIDE;
  }
}

function writeLocal(userId: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function initHideCodesForUser(userId: string) {
  currentUserId = userId;
  hideCodes = loadLocal(userId);
  emit();

  // Hydrate from profile — non-blocking, no error surface.
  void supabase
    .from("profiles")
    .select("hide_codes_pref")
    .eq("id", userId)
    .maybeSingle()
    .then(({ data }) => {
      if (currentUserId !== userId) return;
      const remote = data?.hide_codes_pref;
      if (typeof remote !== "boolean") return;
      if (remote === hideCodes) return;
      hideCodes = remote;
      writeLocal(userId, remote);
      emit();
    });
}

export function getHideCodes(): boolean {
  return hideCodes;
}

export function setHideCodes(value: boolean) {
  hideCodes = value;
  const userId = currentUserId;
  if (userId) writeLocal(userId, value);
  emit();

  if (userId) {
    supabase
      .from("profiles")
      .update({ hide_codes_pref: value })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) console.error("[vault-privacy] persist failed", error);
      });
  }
}

export function subscribeHideCodes(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useHideCodes(): boolean {
  const [value, setValue] = useState<boolean>(() => getHideCodes());
  useEffect(() => {
    return subscribeHideCodes(() => setValue(getHideCodes()));
  }, []);
  return value;
}
