import { deleteSecret, getSecret, setSecret } from "./storage";
import type { AuthResponse } from "@wid/shared";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const REFRESH_KEY = "wid.refreshToken";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const setSessionLostHandler = (fn: () => void) => {
  onSessionLost = fn;
};

export async function saveSession(s: Pick<AuthResponse, "accessToken" | "refreshToken">) {
  accessToken = s.accessToken;
  await setSecret(REFRESH_KEY, s.refreshToken);
}

export async function clearSession() {
  accessToken = null;
  await deleteSecret(REFRESH_KEY);
}

export const getStoredRefreshToken = () => getSecret(REFRESH_KEY);

async function raw(path: string, method: string, body?: unknown, auth = true): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Something went wrong");
  }
  return json as T;
}

/** Single-flight refresh so concurrent 401s don't burn the rotating refresh token twice. */
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const token = await getStoredRefreshToken();
      if (!token) return false;
      const res = await raw("/auth/refresh", "POST", { refreshToken: token }, false);
      if (!res.ok) {
        // Only a definitive rejection ends the session; network errors keep it.
        if (res.status === 401) await clearSession();
        return false;
      }
      await saveSession((await res.json()) as AuthResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = opts.body === undefined ? "GET" : "POST", body, auth = true } = opts;
  let res = await raw(path, method, body, auth);
  if (res.status === 401 && auth && (await refreshSession())) {
    res = await raw(path, method, body, auth);
  }
  if (res.status === 401 && auth && !(await getStoredRefreshToken())) onSessionLost?.();
  return parse<T>(res);
}

/**
 * POST that answers with server-sent events ({t:"delta"|"done"|"error"}). Uses expo/fetch, which streams on
 * native and web. Throws ApiError for normal JSON errors (limits, auth) that arrive before the stream opens.
 */
export async function apiStream(path: string, onEvent: (e: { t: string; text?: string; cached?: boolean; code?: string; message?: string }) => void): Promise<void> {
  const { fetch: streamFetch } = await import("expo/fetch");
  const go = () => streamFetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: "{}" });
  let res = await go();
  if (res.status === 401 && (await refreshSession())) res = await go();
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    throw new ApiError(res.status, json?.error?.code ?? "UNKNOWN", json?.error?.message ?? "Something went wrong");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)));
    }
  }
}
