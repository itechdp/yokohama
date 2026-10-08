import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, ShieldCheck, Trash2, UserPlus, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import * as authClient from "@/lib/auth-client";
import { ApiError, type AdminUserRow } from "@/lib/auth-client";
import SelectMenu from "@/components/select-menu";
import ConfirmDialog from "@/components/confirm-dialog";
import RequiredMark from "@/components/required-mark";

function roleLabel(role: AdminUserRow["role"]): string {
  return role === "admin" ? "Admin" : "Operator";
}

export default function AdminUsers() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);

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

  async function handleDeleteUser() {
    if (!token || !deleteTarget) return;
    try {
      await authClient.deleteUser(token, deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete user");
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
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors"
        >
          <UserPlus className="size-4" />
          Add user
        </button>
      </div>

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="space-y-2">
        {users === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            // Mirrors the server's own check (api/admin/users/[id]/reset-device.ts) -
            // no self-reset for anyone - shown here so the button's disabled
            // state and tooltip explain why, rather than just failing after a click.
            const resetDisabled = !u.device_registered || isSelf;
            const resetTitle = isSelf ? "You cannot reset your own device - ask another admin" : undefined;
            const deleteTitle = isSelf ? "You cannot delete your own account - ask another admin" : undefined;
            return (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{u.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel(u.role)}
                    {" · "}
                    {u.device_registered ? "Device registered" : "No device registered"}
                    {!u.is_active && " · Inactive"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={resetDisabled}
                    title={resetTitle}
                    onClick={() => setResetTarget(u)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset device
                  </button>
                  <button
                    type="button"
                    disabled={isSelf}
                    title={deleteTitle}
                    onClick={() => setDeleteTarget(u)}
                    aria-label={`Delete ${u.username}`}
                    className="inline-flex items-center justify-center rounded-xl border border-danger-border bg-danger-soft p-2 text-danger hover:bg-danger-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this user?"
        message={
          deleteTarget
            ? `${deleteTarget.username} will no longer be able to log in. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
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
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<authClient.UserRole>("operator");
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4" onClick={onClose}>
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
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
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
            onChange={(v) => setRole(v as authClient.UserRole)}
          />
        </label>

        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

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
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-40 transition-colors"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
