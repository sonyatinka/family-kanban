import type {
  AuthResponse,
  LoginRequest,
  PublicUser,
  RegisterRequest,
  ValidationErrorResponse,
} from '@family/shared';

// The session lives in module memory, not in localStorage: a script injected through XSS
// can't read it with one line, and a page reload drops it. After a reload the session is
// restored from the httpOnly refresh cookie (see refreshSession).
let session: AuthResponse | null = null;
const listeners = new Set<() => void>();

export function getUser(): PublicUser | null {
  return session?.user ?? null;
}

// For useSyncExternalStore: React re-renders when the session changes
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSession(next: AuthResponse | null) {
  session = next;
  listeners.forEach((l) => l());
}

// An API error with the status and, for a 400, the errors by field
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: ValidationErrorResponse['errors'] = {},
  ) {
    super(message);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    message?: unknown;
    errors?: ValidationErrorResponse['errors'];
  } | null;
  const message = typeof body?.message === 'string' ? body.message : `HTTP ${res.status}`;
  return new ApiError(res.status, message, body?.errors);
}

// One shared refresh for all callers. Several requests can get a 401 at the same time, and
// React StrictMode runs the startup effect twice in development. Without sharing, each would
// send its own refresh with the same token, and the server would see a reused token.
let refreshing: Promise<AuthResponse | null> | null = null;

// Exchanges the refresh cookie for a new session. Resolves to null if there is no valid
// session (the user has to log in); rejects only on a network error.
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    try {
      // Same origin through the Vite proxy, so the browser sends the cookie by itself
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      const next = res.ok ? ((await res.json()) as AuthResponse) : null;
      setSession(next);
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

// fetch for our API: adds the access token, and on a 401 refreshes the session once and
// repeats the request. The user doesn't notice that the 15-minute token expired.
export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}) {
  const send = () =>
    fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(session && { Authorization: `Bearer ${session.accessToken}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await send();
  // Auth endpoints answer 401 for a wrong password, which a refresh can't fix
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    res = await send();
  }
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function login(data: LoginRequest): Promise<void> {
  setSession(await api<AuthResponse>('/auth/login', { method: 'POST', body: data }));
}

export async function register(data: RegisterRequest): Promise<void> {
  setSession(await api<AuthResponse>('/auth/register', { method: 'POST', body: data }));
}

export async function logout(): Promise<void> {
  try {
    await api<void>('/auth/logout', { method: 'POST' });
  } finally {
    // Forget the session even if the request failed: the user asked to log out
    setSession(null);
  }
}
