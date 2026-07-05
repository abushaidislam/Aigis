// Security response headers applied to every SSR / edge response.
// Kept server-only so no client bundle sees this list (irrelevant there).
//
// The CSP is intentionally *permissive-for-inline* today because
// TanStack Start's hydration ships inline scripts and Tailwind + Framer
// ship inline styles. The follow-up in `plan.md` Phase 5.1 is to move to
// nonce-based `script-src 'strict-dynamic'` — that requires threading a
// per-request nonce through the Start hydration pipeline, which is not
// worth blocking the rest of Phase 1 on.
//
// Origins we allow to connect to from the browser:
//   * Supabase REST / Realtime / Storage / Auth      (*.supabase.co)
//   * Lovable Cloud (Google OAuth broker)            (*.lovable.dev/.app)
//   * Google Fonts CSS + font binaries               (fonts.googleapis.com, fonts.gstatic.com)
//   * Google OAuth consent screen                    (accounts.google.com)
//   * Lovable connector logo API                     (api.simpleicons.org fallbacks come through https:)

const SUPABASE_ORIGINS = "https://*.supabase.co https://*.supabase.in";
const LOVABLE_ORIGINS = "https://*.lovable.dev https://*.lovable.app";
const GOOGLE_ORIGINS = "https://accounts.google.com https://oauth2.googleapis.com";

const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  // Inline scripts: needed by TanStack Start hydration. Tracked for tightening.
  "script-src": "'self' 'unsafe-inline'",
  "script-src-attr": "'none'",
  // Inline styles: Tailwind + Framer Motion emit style attributes at runtime.
  "style-src": `'self' 'unsafe-inline' https://fonts.googleapis.com`,
  "font-src": `'self' https://fonts.gstatic.com data:`,
  // Logos + user avatars can come from arbitrary https origins.
  "img-src": `'self' data: blob: https:`,
  "media-src": `'self' blob:`,
  "connect-src": `'self' ${SUPABASE_ORIGINS} wss://*.supabase.co ${LOVABLE_ORIGINS} ${GOOGLE_ORIGINS}`,
  "frame-src": `'self' ${GOOGLE_ORIGINS}`,
  "frame-ancestors": "'none'",
  "form-action": "'self'",
  "base-uri": "'self'",
  "object-src": "'none'",
  "worker-src": "'self' blob:",
  "manifest-src": "'self'",
  "upgrade-insecure-requests": "",
};

function buildCsp(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join("; ");
}

const CSP_VALUE = buildCsp();

const STATIC_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP_VALUE,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "accelerometer=(), autoplay=(), camera=(self), clipboard-read=(self), clipboard-write=(self), " +
    "display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), " +
    "magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(self), " +
    "screen-wake-lock=(), sync-xhr=(self), usb=(), xr-spatial-tracking=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  // We can NOT ship COEP: require-corp yet — it breaks 3rd-party logos
  // and Google Fonts. Revisit alongside the Phase 5 PWA work.
  "X-DNS-Prefetch-Control": "off",
};

/**
 * Copy a response and stamp our security headers on it. Never touches the
 * body — the underlying stream is passed through unmodified.
 *
 * We do NOT overwrite headers the app has already set (e.g. a route that
 * wanted its own Cache-Control), except for the four hardening headers
 * that must be authoritative from the edge.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(STATIC_HEADERS)) {
    // The four hardening headers below are authoritative — a lower layer
    // must not weaken them.
    if (
      name === "Content-Security-Policy" ||
      name === "Strict-Transport-Security" ||
      name === "X-Frame-Options" ||
      name === "X-Content-Type-Options"
    ) {
      headers.set(name, value);
      continue;
    }
    if (!headers.has(name)) headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Exported for the CI header assertion in tests/edge/. */
export const __TEST_ONLY__ = {
  CSP_VALUE,
  STATIC_HEADERS,
};
