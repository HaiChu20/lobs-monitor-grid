// handler.ts — turns an incoming HTTP Request for /api/* or /ingest into a
// Response. Returns null for anything else, so server.ts falls through to the
// normal website renderer. No web framework needed: it's just (Request) => Response.

import type { IngestPayload } from "@/lib/streamer/ingest";
import { buildIncidents, buildOverview, buildServiceDetail, buildSymbols, ingest } from "./store";

/** Map a ?window=1h|6h|24h|7d query param to milliseconds (default 24h). */
function windowMs(url: URL): number {
  const map: Record<string, number> = { "1h": 3600_000, "6h": 6 * 3600_000, "24h": 24 * 3600_000, "7d": 7 * 24 * 3600_000 };
  return map[url.searchParams.get("window") ?? "24h"] ?? 24 * 3600_000;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Handle our backend routes. Returns a Response for /ingest and /api/*,
 * or null if this request isn't ours (let TanStack render the page).
 */
export async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Liveness/readiness probe (OpenShift). Cheap, no SSR.
  if (path === "/healthz") return json({ ok: true });

  // ---- ingest: the cPouta agent POSTs dumb snapshots here -------------------
  if (path === "/ingest") {
    if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
    // Shared-secret check. If INGEST_TOKEN is unset (local dev), we allow all
    // but warn once, so `npm run dev` "just works" without configuring a token.
    const expected = process.env.INGEST_TOKEN;
    if (expected) {
      const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (got !== expected) return json({ ok: false, error: "unauthorized" }, 401);
    } else if (!warnedNoToken) {
      warnedNoToken = true;
      console.warn("[ingest] INGEST_TOKEN not set — accepting unauthenticated pushes (dev only).");
    }
    let payload: IngestPayload;
    try {
      payload = (await request.json()) as IngestPayload;
    } catch {
      return json({ ok: false, error: "invalid JSON" }, 400);
    }
    if (!payload?.host || !Array.isArray(payload.services)) {
      return json({ ok: false, error: "expected { host, services: [...] }" }, 400);
    }
    ingest(payload);
    return json({ ok: true, received: payload.services.length });
  }

  // ---- read endpoints the frontend polls ------------------------------------
  if (path === "/api/overview") return json(buildOverview(windowMs(url)));

  if (path === "/api/incidents") {
    const w = url.searchParams.get("window") ?? "7d";
    const days = parseInt(w, 10) || 7;
    return json(buildIncidents(days));
  }

  if (path === "/api/symbols") return json(buildSymbols());

  if (path.startsWith("/api/services/")) {
    const id = decodeURIComponent(path.slice("/api/services/".length));
    const detail = buildServiceDetail(id, windowMs(url));
    return detail ? json(detail) : json({ error: "service not found" }, 404);
  }

  return null; // not ours
}

let warnedNoToken = false;
