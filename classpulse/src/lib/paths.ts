/**
 * Base path support for hosting under a sub-path (e.g. GitHub Pages project
 * sites: https://<user>.github.io/<repo>/). Set at build time with
 * NEXT_PUBLIC_BASE_PATH="/<repo>". Next's <Link> and router add it
 * automatically; use withBase() for raw URLs (img src, window.location,
 * service worker, manifest, auth redirects).
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

export function withBase(path: string) {
  if (!path.startsWith("/")) return path;
  return `${BASE_PATH}${path}`;
}

/** Strip the base path from a browser pathname so it can be used as an app route. */
export function withoutBase(pathname: string) {
  return BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) || "/" : pathname;
}

// Record pages use a query string so the whole app can be exported as static files.
export const classHref = (id: string) => `/classroom/view?id=${encodeURIComponent(id)}`;
export const studentHref = (id: string) => `/students/view?id=${encodeURIComponent(id)}`;
export const planHref = (id: string) => `/interventions/view?id=${encodeURIComponent(id)}`;
