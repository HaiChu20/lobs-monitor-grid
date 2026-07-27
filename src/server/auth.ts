// auth.ts — optional HTTP Basic Auth for the dashboard UI + API.
//
// Gated by env DASH_USER / DASH_PASS. If either is unset, auth is OFF (dev).
// Exemptions:
//   • /healthz  — OpenShift probes must reach it unauthenticated.
//   • /ingest   — the cPouta agent authenticates with its own bearer token.
// Everything else (pages + /api/*) requires the username/password, so the
// browser prompts once and then caches the credentials for the origin.

export function basicAuthGate(request: Request): Response | null {
  const path = new URL(request.url).pathname;
  if (path === "/healthz" || path === "/ingest") return null;

  const user = process.env.DASH_USER;
  const pass = process.env.DASH_PASS;
  if (!user || !pass) return null; // auth disabled

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (decoded.slice(0, i) === user && decoded.slice(i + 1) === pass) return null; // ok
    } catch {
      /* fall through to 401 */
    }
  }
  return new Response("Authentication required.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Streamer Status"', "content-type": "text/plain" },
  });
}
