import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import type { AuthResponse, AuthUser, SignupInput } from "@wid/shared";
import { api, clearSession, getStoredRefreshToken, refreshSession, saveSession, setSessionLostHandler } from "./api";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthCtx {
  status: Status;
  user: AuthUser | null;
  /** True once the user chose "later" on the verify screen this session. */
  verifySkipped: boolean;
  skipVerify(): void;
  signup(input: Omit<SignupInput, "acceptTerms" | "deviceLabel">): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(everywhere?: boolean): Promise<void>;
  verify(code: string): Promise<void>;
  resendCode(): Promise<void>;
  /** Replace tokens after an endpoint that returns a fresh session (e.g. change-password). */
  adoptSession(s: AuthResponse): Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const deviceLabel = Platform.OS === "ios" ? "iPhone" : Platform.OS === "android" ? "Android" : "Web";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [verifySkipped, setVerifySkipped] = useState(false);

  const signedOut = useCallback(() => {
    setUser(null);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    setSessionLostHandler(signedOut);
    (async () => {
      if (!(await getStoredRefreshToken())) return signedOut();
      if (!(await refreshSession())) {
        // Rejected token => signed out; otherwise (offline) we still have no access token, so treat as signed out too.
        return signedOut();
      }
      try {
        setUser(await api<AuthUser>("/me"));
        setStatus("signedIn");
      } catch {
        signedOut();
      }
    })();
  }, [signedOut]);

  const adoptSession = useCallback(async (s: AuthResponse) => {
    await saveSession(s);
    setUser(s.user);
    setStatus("signedIn");
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      verifySkipped,
      skipVerify: () => setVerifySkipped(true),
      async signup(input) {
        const s = await api<AuthResponse>("/auth/signup", {
          auth: false,
          body: { ...input, acceptTerms: true, deviceLabel },
        });
        setVerifySkipped(false);
        await adoptSession(s);
      },
      async login(email, password) {
        const s = await api<AuthResponse>("/auth/login", { auth: false, body: { email, password, deviceLabel } });
        setVerifySkipped(false);
        await adoptSession(s);
      },
      async logout(everywhere = false) {
        try {
          if (everywhere) await api("/auth/logout-all", { body: {} });
          else {
            const refreshToken = await getStoredRefreshToken();
            if (refreshToken) await api("/auth/logout", { auth: false, body: { refreshToken } });
          }
        } catch {
          // Best effort: local sign-out must always succeed.
        }
        await clearSession();
        signedOut();
      },
      async verify(code) {
        await api("/auth/verify-email", { body: { code } });
        setUser((u) => (u ? { ...u, emailVerified: true } : u));
      },
      async resendCode() {
        await api("/auth/resend-code", { body: {} });
      },
      adoptSession,
    }),
    [status, user, verifySkipped, adoptSession, signedOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
