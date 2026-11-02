import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import * as authClient from "@/lib/auth-client";
import type { SessionUser } from "@/lib/auth-client";
import type { ModuleKey } from "@/lib/user-policy";

// How often the signed-in person is re-checked against the server (role, modules, active).
const REVALIDATE_MS = 60_000;
// The old login kept the user in localStorage under this key; it is no longer trusted or used.
const LEGACY_STORAGE_KEY = "yokohama_user";

interface AuthContextValue {
  user: SessionUser | null;
  /** True until the saved session has been checked once on start-up. */
  loading: boolean;
  isStaff: boolean;
  can: (module: ModuleKey) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-read the person's profile (after changing their own password, for example). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const sameUser = (a: SessionUser | null, b: SessionUser | null) => JSON.stringify(a) === JSON.stringify(b);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  // Ask the server who this session is. "none" means signed out / deactivated / deleted.
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      if (mounted.current) setUser(null);
      return;
    }
    const me = await authClient.fetchMe();
    if (!mounted.current) return;
    if (me.status === "ok") {
      setUser((prev) => (sameUser(prev, me.user) ? prev : me.user));
    } else if (me.status === "none") {
      await supabase.auth.signOut();
      setUser(null);
    }
    // status "error" (offline, server hiccup): keep the person signed in.
  }, []);

  useEffect(() => {
    mounted.current = true;
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // localStorage unavailable - nothing to clean up.
    }

    refresh().finally(() => {
      if (mounted.current) setLoading(false);
    });

    // Never call back into supabase from inside this listener; defer it.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setTimeout(() => mounted.current && setUser(null), 0);
    });

    const timer = window.setInterval(() => void refresh(), REVALIDATE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    setUser(await authClient.login(username, password));
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await authClient.logout();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isStaff = user?.role === "admin" || user?.role === "super_admin";
    return {
      user,
      loading,
      isStaff,
      can: (module) => Boolean(user) && (isStaff || user!.modules.includes(module)),
      login,
      logout,
      refresh,
    };
  }, [user, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
