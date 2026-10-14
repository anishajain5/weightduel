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
