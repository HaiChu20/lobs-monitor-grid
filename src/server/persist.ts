// persist.ts — durability for the in-memory store: one JSON file that survives
// restarts. In Rahti this file lives on a PersistentVolumeClaim (RWO), the only
// thing that outlives a pod. No database server needed at this scale.
//
// Design: the store stays the fast in-memory working copy; we just LOAD it on
// boot and SAVE it on change (debounced + atomic). If the filesystem isn't
// available (e.g. a Cloudflare build target), every call degrades to a no-op and
// the app runs in-memory-only — it never crashes over persistence.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ServiceState } from "./store";

// Where the state file lives. Dev: ./.data (gitignored). Rahti: /data (the PVC).
const STATE_DIR = process.env.STATE_DIR || "./.data";
const STATE_FILE = join(STATE_DIR, "state.json");
const DEBOUNCE_MS = 2000;
const VERSION = 1;

interface PersistedFile {
  version: number;
  savedAt: number;
  services: ServiceState[];
}

/** Read persisted services on boot. Returns [] if missing/corrupt/unavailable. */
export function loadServices(): ServiceState[] {
  try {
    if (!existsSync(STATE_FILE)) return [];
    const data = JSON.parse(readFileSync(STATE_FILE, "utf8")) as PersistedFile;
    if (data.version !== VERSION || !Array.isArray(data.services)) return [];
    console.log(`[persist] loaded ${data.services.length} service(s) from ${STATE_FILE}`);
    return data.services;
  } catch (e) {
    console.warn("[persist] load failed, starting empty:", (e as Error).message);
    return [];
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: (() => ServiceState[]) | null = null;

/** Request a save. Coalesces bursts of pushes into one write every DEBOUNCE_MS. */
export function scheduleSave(getServices: () => ServiceState[]): void {
  pending = getServices;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const fn = pending;
    pending = null;
    if (fn) saveNow(fn());
  }, DEBOUNCE_MS);
  (timer as { unref?: () => void }).unref?.();
}

/** Write immediately (used on SIGTERM so the last state isn't lost on shutdown). */
export function saveNow(services: ServiceState[]): void {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    const body = JSON.stringify({ version: VERSION, savedAt: Date.now(), services } satisfies PersistedFile);
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, body); // temp-then-rename = atomic: a crash can't leave a half-written file
    renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.warn("[persist] save failed:", (e as Error).message);
  }
}
