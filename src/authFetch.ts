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

// In-memory fallback for the session token. Login.tsx deliberately does NOT
// persist the token to localStorage when the user unchecks "Remember
// session" (so it doesn't survive a browser restart on a shared machine) -
// but authFetch used to read the token from localStorage exclusively, so
// with "Remember session" off, every authFetch call went out with no
// Authorization header at all and immediately 401'd, right after a
// successful login. App.tsx calls setSessionToken() on login/logout so the
// current tab's in-flight session keeps working either way; only
// persistence across a browser restart depends on "Remember session".
let inMemoryToken: string | null = null;

export function setSessionToken(token: string | null): void {
  inMemoryToken = token;
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = inMemoryToken || localStorage.getItem('kcm_session_token');
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

// 2026-09-21 security/reliability hardening - this used to log the employee
// straight out and force a full page reload the instant ANY 502/503/504 or
// network-level failure happened, on the theory that it meant a deploy was
// in progress. In practice that punished ordinary transient blips exactly
// as hard as a real outage - a single dropped Wi-Fi packet, a brief mobile
// network handover, or one slow upstream response could drop someone back
// to the login screen mid-entry with "anything in progress was NOT saved",
// even though nothing was actually wrong with their session and the
// request would very likely have succeeded a moment later. A transient
// infrastructure hiccup must never look identical to (or be treated the
// same as) a genuine authentication failure - only a real 401 from
// authFetch's own handler above may ever log someone out.
//
// New behavior: transient failures are retried automatically, and only a
// non-destructive "still trying to reach the server" warning is ever shown
// - never a forced logout, never a forced reload, and the calling form's
// own state/unsaved input is completely untouched either way.
//
// Retries only ever apply to GET requests. GET is naturally idempotent -
// retrying it can't create a duplicate anything, so it's always safe.
// POST/PUT/DELETE are deliberately NEVER auto-retried here: a 504 in
// particular can mean the upstream actually finished the write and the
// reverse proxy simply gave up waiting for the response, so blindly
// retrying a save could silently create a duplicate entry. A failed
// mutating request instead just fails through immediately to the calling
// code's own try/catch (every save handler in this app already shows its
// own specific error there - see e.g. FuelManagement.tsx's handleSubmit)
// rather than being intercepted here at all.
const TRANSIENT_RETRY_DELAYS_MS = [600, 1500]; // 3 attempts total for a GET
let backendUnreachableHandler: ((recovered: boolean) => void) | null = null;

// `recovered=false` when connectivity trouble is first detected (show a
// warning); `recovered=true` once a subsequent request succeeds again
// (clear it). Never fires for a mutating request - see the comment above.
export function registerBackendUnreachableHandler(handler: (recovered: boolean) => void): void {
  backendUnreachableHandler = handler;
}

// One-shot-per-outage debouncing - a dead backend fails every in-flight/
// concurrent GET at once, so only the first should show the warning circle.
// Reset after a fresh login (or once recovered) so a later, separate
// outage can show it again.
let backendUnreachableNotified = false;

export function resetBackendUnreachableNotification(): void {
  backendUnreachableNotified = false;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isTransientStatus = (status: number) => status === 502 || status === 503 || status === 504;

let backendUnreachableGuardInstalled = false;

// Call once, early (see App.tsx) - idempotent, safe to call more than once.
export function installBackendUnreachableGuard(): void {
  if (backendUnreachableGuardInstalled) return;
  backendUnreachableGuardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    const method = ((args[1]?.method) || 'GET').toUpperCase();
    const isRetryable = method === 'GET';
    const maxAttempts = isRetryable ? TRANSIENT_RETRY_DELAYS_MS.length + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await originalFetch(...args);
        // A plain 500 is left alone deliberately - that's more likely a
        // real bug in one specific request, not the whole backend being
        // unreachable, so it should still surface as a normal in-context
        // error rather than triggering retries/a connectivity warning.
        if (isTransientStatus(res.status) && attempt < maxAttempts) {
          await sleep(TRANSIENT_RETRY_DELAYS_MS[attempt - 1]);
          continue;
        }
        if (isTransientStatus(res.status)) {
          if (!backendUnreachableNotified) {
            backendUnreachableNotified = true;
            backendUnreachableHandler?.(false);
          }
          return res; // exhausted retries (or non-GET) - let the caller's own fallback handle it, same response shape as before
        }
        // A real response came back - connectivity is fine; clear any
        // previously-shown warning so it doesn't linger past the outage.
        if (backendUnreachableNotified) {
          backendUnreachableNotified = false;
          backendUnreachableHandler?.(true);
        }
        return res;
      } catch (err) {
        // Network-level failure - fetch couldn't reach the server at all
        // (connection refused, DNS failure, mid-restart) - never produces a
        // Response, so it'd otherwise only ever surface as an unhandled
        // rejection in whichever component's own .catch() (or lack of one).
        if (attempt < maxAttempts) {
          await sleep(TRANSIENT_RETRY_DELAYS_MS[attempt - 1]);
          continue;
        }
        if (!backendUnreachableNotified) {
          backendUnreachableNotified = true;
          backendUnreachableHandler?.(false);
        }
        throw err;
      }
    }
    // Unreachable in practice (loop always returns/throws above) - kept
    // only so TypeScript sees every path returning a Response.
    return originalFetch(...args);
  }) as typeof fetch;
}
