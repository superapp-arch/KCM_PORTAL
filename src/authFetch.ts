// Drop-in replacement for fetch() that attaches this browser's session token
// as a Bearer header. Required for any endpoint the server actually enforces
// authorization on - a plain fetch() would omit the token and get a 401 back.
//
// It also watches every response for a 401: if a request that WAS sent with
// a token comes back unauthorized (session expired/invalidated, or the
// server process restarted and lost an old in-memory session before this
// was made persistent - see src/auth/session.ts), that means the browser is
// holding a token the server no longer honors. Left unhandled, the calling
// component's own save-success logic would often still run (many save
// handlers only did `if (res.ok) {...}` with no explicit else), so an
// employee could click Save, silently get a 401, and see nothing telling
// them it didn't actually save. Firing a single global "session expired"
// callback here - one place, covering every module that saves through
// authFetch - closes that gap without needing to individually audit every
// call site for it.
let sessionExpiredHandler: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

// A page can fire a burst of concurrent authFetch calls (e.g. App.tsx's
// fetchAllData Promise.all) - only the first 401 in a burst should trigger
// the flow, not one per request. Reset after a fresh login so it can fire
// again if the session expires a second time later.
let sessionExpiredNotified = false;

export function resetSessionExpiredNotification(): void {
  sessionExpiredNotified = false;
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('kcm_session_token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers }).then(res => {
    if (res.status === 401 && token && !sessionExpiredNotified) {
      sessionExpiredNotified = true;
      sessionExpiredHandler?.();
    }
    return res;
  });
}

// 2026-08-28: a deploy (git pull + npm run build + server restart) leaves a
// brief window where the backend is down or mid-restart - any save
// attempted right then either can't reach the server at all (fetch itself
// throws) or gets a 502/503/504 from whatever's in front of it, and neither
// of those is a 401, so the handler above never catches it. Left unhandled,
// that save just silently fails and the employee has no idea it didn't go
// through. Patches window.fetch itself (not just authFetch) so this covers
// every plain fetch() call in the app too - App.tsx's fetchAllData and
// several save handlers still use plain fetch rather than authFetch, and
// this is one choke point instead of auditing every call site.
let backendUnreachableHandler: (() => void) | null = null;

export function registerBackendUnreachableHandler(handler: () => void): void {
  backendUnreachableHandler = handler;
}

// Same one-shot-per-outage debouncing as sessionExpiredNotified above - a
// dead backend fails every in-flight/concurrent request at once, so only
// the first should trigger the logout+reload flow. Reset after a fresh
// login so a later, separate outage can trigger it again.
let backendUnreachableNotified = false;

export function resetBackendUnreachableNotification(): void {
  backendUnreachableNotified = false;
}

let backendUnreachableGuardInstalled = false;

// Call once, early (see App.tsx) - idempotent, safe to call more than once.
export function installBackendUnreachableGuard(): void {
  if (backendUnreachableGuardInstalled) return;
  backendUnreachableGuardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    try {
      const res = await originalFetch(...args);
      // 502/503/504 - the classic "reverse proxy in front of a backend
      // that's down or restarting" signals. A plain 500 is left alone
      // deliberately: that's more likely a real bug in one specific
      // request, not the whole backend being unreachable, so it should
      // still surface as a normal in-context error instead of logging
      // everyone out.
      if ((res.status === 502 || res.status === 503 || res.status === 504) && !backendUnreachableNotified) {
        backendUnreachableNotified = true;
        backendUnreachableHandler?.();
      }
      return res;
    } catch (err) {
      // Network-level failure - fetch couldn't reach the server at all
      // (connection refused, DNS failure, mid-restart) - never produces a
      // Response, so it'd otherwise only ever surface as an unhandled
      // rejection in whichever component's own .catch() (or lack of one).
      if (!backendUnreachableNotified) {
        backendUnreachableNotified = true;
        backendUnreachableHandler?.();
      }
      throw err;
    }
  }) as typeof fetch;
}
