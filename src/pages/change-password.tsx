import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import * as authClient from "@/lib/auth-client";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/user-policy";
import RequiredMark from "@/components/required-mark";

// The Super Admin can change their own password here (the current password is required).
// Admins and Operators always use the password an administrator set for them: the route is
// Super Admin only, and the change-password Edge Function refuses everyone else.
export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const problem = next ? passwordProblem(next, user?.username) : null;
  const mismatch = confirm.length > 0 && confirm !== next;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const p = passwordProblem(next, user?.username);
    if (p) return setError(p);
    if (next !== confirm) return setError("The two new passwords do not match");
    if (next === current) return setError("The new password must be different from the current one");
    setSubmitting(true);
    try {
      await authClient.changeOwnPassword(current, next);
      setDone(true);
      window.setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "w-full rounded-xl border border-border bg-card px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      aria-label={show ? "Hide passwords" : "Show passwords"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    >
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <KeyRound className="size-6" />
          </span>
          <h1 className="text-lg font-semibold text-foreground">Change password</h1>
          <p className="text-sm text-muted-foreground">{`Signed in as ${user?.username ?? ""}.`}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Current password
            <RequiredMark />
          </span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              className={field}
            />
            {toggle}
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            New password
            <RequiredMark />
          </span>
          <input
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            className={field}
          />
          {problem && <p className="text-xs text-danger">{problem}</p>}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Confirm new password
            <RequiredMark />
          </span>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className={field}
          />
          {mismatch && <p className="text-xs text-danger">Passwords do not match</p>}
        </label>

        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {done && (
          <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-foreground">
            Password changed. Your other sessions were signed out.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || done || Boolean(problem) || mismatch || !current || !next || !confirm}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {submitting ? "Saving..." : "Change password"}
        </button>
      </form>
    </div>
  );
}
