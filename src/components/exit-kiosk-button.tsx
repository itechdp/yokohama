import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/auth-context";
import { KioskLock } from "@/plugins/kiosk-lock";
import { verifyExitPin } from "@/lib/exit-pin";

// The ONLY way an operator can leave the kiosk-locked app - entering the
// shared Exit PIN (set by an admin on the Manage Users page) is the
// confirmation itself, so there's no separate "are you sure" step. Order on
// success matters: disable() before logout()/navigate so there's no frame
// of unlocked content on the still-fullscreen operator screen, and no frame
// of /login rendered while still fullscreen/pinned.
export default function ExitKioskButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function close() {
    setOpen(false);
    setPin("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setChecking(true);
    try {
      const ok = await verifyExitPin(pin.trim());
      if (!ok) {
        setError("Incorrect PIN.");
        setPin("");
        return;
      }
      if (Capacitor.isNativePlatform()) {
        await KioskLock.disable().catch(() => {});
      }
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check PIN.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Exit"
        className="flex size-10 items-center justify-center rounded-full bg-[rgba(0,0,0,0.3)] text-white backdrop-blur-sm transition-transform active:scale-95"
      >
        <LogOut className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4" onClick={close}>
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-5 shadow-xl"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Enter Exit PIN</h2>
              <p className="text-sm text-muted-foreground">Ask a supervisor for the PIN to exit.</p>
            </div>

            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              autoFocus
              required
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-center text-lg tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={checking || !pin.trim()}
                className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger-hover disabled:opacity-40 transition-colors"
              >
                {checking ? "Checking..." : "Exit"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
