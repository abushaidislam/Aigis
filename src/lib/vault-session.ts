// In-memory vault session. The DEK never touches localStorage or
// sessionStorage — it lives only in this module's closure. A hard refresh
// or tab close wipes it, forcing re-unlock.
//
// Also owns the auto-lock timer (user-configurable, persisted per user
// in localStorage). `null` means "never auto-lock".

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const AUTO_LOCK_OPTIONS: { label: string; value: number | null }[] = [
  { label: "After 1 minute", value: 60 * 1000 },
  { label: "After 5 minutes", value: 5 * 60 * 1000 },
  { label: "After 15 minutes", value: 15 * 60 * 1000 },
  { label: "After 30 minutes", value: 30 * 60 * 1000 },
  { label: "Never", value: null },
];

const DEFAULT_AUTO_LOCK_MS: number | null = 5 * 60 * 1000;
const STORAGE_PREFIX = "aegis.autolock.";

let autoLockMs: number | null = DEFAULT_AUTO_LOCK_MS;
let currentUserId: string | null = null;

let dek: CryptoKey | null = null;
let lockTimer: number | null = null;
const listeners = new Set<() => void>();
const settingsListeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function emitSettings() {
  for (const l of settingsListeners) l();
}

function storageKey(userId: string) {
  return STORAGE_PREFIX + userId;
}

function loadAutoLock(userId: string): number | null {
  if (typeof window === "undefined") return DEFAULT_AUTO_LOCK_MS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw === null) return DEFAULT_AUTO_LOCK_MS;
    if (raw === "never") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_AUTO_LOCK_MS;
  } catch {
    return DEFAULT_AUTO_LOCK_MS;
  }
}

function encodePref(value: number | null): string {
  return value === null ? "never" : String(value);
}

function decodePref(raw: string | null | undefined): number | null | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (raw === "never") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function initAutoLockForUser(userId: string) {
  currentUserId = userId;
  // Optimistic: read the cached value from localStorage right away so the UI
  // never flashes the wrong choice during the round trip.
  autoLockMs = loadAutoLock(userId);
  emitSettings();

  // Hydrate from the user's profile so the choice syncs across devices.
  void supabase
    .from("profiles")
    .select("auto_lock_pref")
    .eq("id", userId)
    .maybeSingle()
    .then(({ data }) => {
      if (currentUserId !== userId) return;
      const remote = decodePref(data?.auto_lock_pref);
      if (remote === undefined) return;
      if (remote === autoLockMs) return;
      autoLockMs = remote;
      // Keep the local cache in sync too.
      try {
        window.localStorage.setItem(storageKey(userId), encodePref(remote));
      } catch {
        // ignore
      }
      if (dek) scheduleAutoLock();
      emitSettings();
    });
}

export function getAutoLockMs(): number | null {
  return autoLockMs;
}

export function setAutoLockMs(value: number | null) {
  autoLockMs = value;
  const userId = currentUserId;
  if (userId && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey(userId), encodePref(value));
    } catch {
      // ignore
    }
  }
  // Reschedule with the new value if vault is unlocked.
  if (dek) scheduleAutoLock();
  emitSettings();

  // Persist to the user's profile so it follows them across devices.
  if (userId) {
    void supabase
      .from("profiles")
      .update({ auto_lock_pref: encodePref(value) })
      .eq("id", userId);
  }
}

function scheduleAutoLock() {
  if (typeof window === "undefined") return;
  if (lockTimer !== null) {
    window.clearTimeout(lockTimer);
    lockTimer = null;
  }
  if (autoLockMs === null) return; // "Never"
  lockTimer = window.setTimeout(() => {
    lockVault();
  }, autoLockMs);
}

export function setVaultKey(key: CryptoKey) {
  dek = key;
  scheduleAutoLock();
  emit();
}

export function getVaultKey(): CryptoKey | null {
  if (dek) scheduleAutoLock();
  return dek;
}

export function isVaultUnlocked(): boolean {
  return dek !== null;
}

export function lockVault() {
  if (lockTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(lockTimer);
    lockTimer = null;
  }
  dek = null;
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function subscribeSettings(fn: () => void): () => void {
  settingsListeners.add(fn);
  return () => settingsListeners.delete(fn);
}

export function useVaultUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState<boolean>(() => isVaultUnlocked());
  useEffect(() => {
    return subscribe(() => setUnlocked(isVaultUnlocked()));
  }, []);
  return unlocked;
}

export function useAutoLockMs(): number | null {
  const [value, setValue] = useState<number | null>(() => getAutoLockMs());
  useEffect(() => {
    return subscribeSettings(() => setValue(getAutoLockMs()));
  }, []);
  return value;
}

// Bump the auto-lock timer on user activity. Call once from the app shell.
export function useActivityKeepAlive() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => {
      if (dek) scheduleAutoLock();
    };
    const events = ["pointerdown", "keydown", "visibilitychange"] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
    };
  }, []);
}
