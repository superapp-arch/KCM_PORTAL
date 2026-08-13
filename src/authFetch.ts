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
