import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, UserPlus, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import * as authClient from "@/lib/auth-client";
import { ApiError, type AdminUserRow } from "@/lib/auth-client";
import SelectMenu from "@/components/select-menu";
import ConfirmDialog from "@/components/confirm-dialog";
import RequiredMark from "@/components/required-mark";

export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const { users } = await authClient.listUsers(token);
      setUsers(users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleResetDevice() {
    if (!token || !resetTarget) return;
    try {
      await authClient.resetDevice(token, resetTarget.id);
      setResetTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset device");
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <ShieldCheck className="size-5 text-primary" />
          Manage users
        </h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="size-4" />
          Add user
        </button>
      </div>

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="space-y-2">
        {users === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{u.username}</p>
                <p className="text-xs text-muted-foreground">
                  {u.role === "admin" ? "Admin" : "Operator"}
                  {" · "}
                  {u.device_registered ? "Device registered" : "No device registered"}
                  {!u.is_active && " · Inactive"}
                </p>
              </div>
              <button
                type="button"
                disabled={!u.device_registered}
                onClick={() => setResetTarget(u)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="size-3.5" />
                Reset device
              </button>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Reset device?"
        message={
          resetTarget
            ? `${resetTarget.username} will be able to log in from a new phone. Their current device will no longer work until they log in again.`
            : ""
        }
        confirmLabel="Reset device"
        destructive
        onConfirm={handleResetDevice}
        onCancel={() => setResetTarget(null)}
      />
    </div>
  );
}

function CreateUserModal({
  token,
  onClose,
  onCreated,
}: {
  token: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await authClient.createUser(token, { username: username.trim(), password, role });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-foreground">Add user</h2>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Username
            <RequiredMark />
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            required
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Initial password
            <RequiredMark />
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            placeholder="At least 8 characters"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Role</span>
          <SelectMenu
            value={role}
            placeholder="Select role"
            options={[
              { value: "operator", label: "Operator" },
              { value: "admin", label: "Admin" },
            ]}
            onChange={(v) => setRole(v as "admin" | "operator")}
          />
        </label>

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
