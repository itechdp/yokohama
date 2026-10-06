import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DeviceKeystore } from "@/plugins/device-keystore";
import * as authClient from "@/lib/auth-client";
import type { SessionUser } from "@/lib/auth-client";

const STORAGE_KEY = "yokohama_auth";

interface StoredAuth {
  token: string;
  user: SessionUser;
}

interface AuthContextValue {
  user: SessionUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());

  const login = useCallback(async (username: string, password: string) => {
    const { publicKey } = await DeviceKeystore.generateKeyPair();
    const { challenge_token } = await authClient.requestChallenge(username);
    const { signature } = await DeviceKeystore.sign({ data: challenge_token });

    const { session_jwt, user } = await authClient.login({
      username,
      password,
      challenge_token,
      signature_b64: signature,
      device_public_key_b64: publicKey,
    });

    const next: StoredAuth = { token: session_jwt, user };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode etc.) - session still works for this page load.
    }
    setAuth(next);
  }, []);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setAuth(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user: auth?.user ?? null, token: auth?.token ?? null, login, logout }),
    [auth, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
