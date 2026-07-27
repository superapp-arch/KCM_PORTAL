// Drop-in replacement for fetch() that attaches this browser's session token
// as a Bearer header. Required for any endpoint the server actually enforces
// authorization on (currently /api/staff/*) - a plain fetch() would omit the
// token and get a 401 back.
export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('kcm_session_token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
