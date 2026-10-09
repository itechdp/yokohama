import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { useAuth } from "@/contexts/auth-context";
import { KioskLock } from "@/plugins/kiosk-lock";

// Mounted once at the app root (inside the Router, so useLocation/useNavigate
// work). Owns two things:
//   1. enabling/disabling native kiosk mode as user.role changes
//   2. the hardware/software Back button's root-vs-detail routing logic
// Both are JS-only concerns: there is no native back stack of "screens" in
// this single-Activity Capacitor WebView app, only React Router state, so
// Back semantics have to live here, not in Java (see KioskHelper.java,
// which only owns true OS-level primitives: fullscreen, screen pinning,
// keep-screen-on).
export function useKioskLock() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();
  const locked = user?.role === "operator";

  // Enable/disable native kiosk mode whenever lock-worthiness changes,
  // including on first mount - auth-context already restores `user`
  // synchronously from localStorage before first render, so a killed and
  // reopened app with a saved operator session re-locks immediately here.
  useEffect(() => {
    if (!isNative) return;
    if (locked) {
      KioskLock.enable().catch(() => {});
    } else {
      KioskLock.disable().catch(() => {});
    }
  }, [isNative, locked]);

  // Back button: root-vs-detail logic lives here because the "screens" are
  // React Router routes inside one WebView, not native Activities.
  // capacitor.config.ts disables Capacitor's own default handler so this
  // listener fully owns every case, including the normal admin/login path.
  useEffect(() => {
    if (!isNative) return;

    const sub = App.addListener("backButton", ({ canGoBack }) => {
      if (locked) {
        if (location.pathname !== "/") {
          navigate(-1);
        }
        // On the operator's root screen: swallow entirely. No exitApp,
        // no minimize, no return to /login.
        return;
      }
      // Admin, no user, or /login: normal default Capacitor behavior.
      if (canGoBack) {
        navigate(-1);
      } else {
        App.exitApp();
      }
    });

    return () => {
      sub.then((handle) => handle.remove());
    };
  }, [isNative, locked, location.pathname, navigate]);
}
