import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Copy, Eye, EyeOff, KeyRound, Lock, Pencil, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import * as authClient from "@/lib/auth-client";
import type { AuditRow, UserRow } from "@/lib/auth-client";
import { MODULES } from "@/lib/modules";
import { generateTemporaryPassword } from "@/lib/password-generator";
import { MIN_PASSWORD_LENGTH, canManage, passwordProblem, usernameProblem, type ModuleKey, type Role } from "@/lib/user-policy";
import ConfirmDialog from "@/components/confirm-dialog";
import ModulePicker from "@/components/module-picker";
import RequiredMark from "@/components/required-mark";
import SelectMenu from "@/components/select-menu";

const ROLE_LABEL: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", operator: "Operator" };
const ROLE_NOTE: Record<Role, string> = {
  super_admin: "Full control of everything",
  admin: "All modules; manages Operators",
  operator: "Only the modules given to them",
};

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const primaryBtn =
  "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-40 transition-colors";
const ghostBtn =
  "rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors";

function describeAudit(r: AuditRow): string {
  const who = r.actorUsername ?? "System";
  const target = r.targetUsername ?? "someone";
  const d = r.details as Record<string, unknown>;
  switch (r.action) {
    case "user_created":
      return `${who} created ${target} (${ROLE_LABEL[d.role as Role] ?? d.role})`;
    case "user_deleted":
      return `${who} deleted ${target}`;
    case "user_renamed":
      return `${who} renamed ${String(d.old_username)} to ${String(d.new_username)}`;
    case "user_deactivated":
      return `${who} deactivated ${target}`;
    case "user_activated":
      return `${who} reactivated ${target}`;
    case "role_changed":
      return `${who} changed ${target} from ${ROLE_LABEL[d.before as Role] ?? d.before} to ${ROLE_LABEL[d.after as Role] ?? d.after}`;
    case "modules_changed":
      return `${who} changed the modules of ${target}`;
    case "password_reset":
      return `${who} reset the password of ${target}`;
    case "password_changed":
      return `${target} changed their own password`;
    case "login_locked":
      return `Too many wrong passwords: ${target} was locked out for 15 minutes`;
    default:
      return `${who}: ${r.action} (${target})`;
  }
}

function moduleSummary(u: UserRow): string {
  if (u.role !== "operator") return "All modules";
  if (u.modules.length === 0) return "No modules yet";
  if (u.modules.length === MODULES.length) return "All modules";
  return `${u.modules.length} of ${MODULES.length} modules`;
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const isSuper = me?.role === "super_admin";
  const [tab, setTab] = useState<"users" | "activity">("users");
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  async function refresh() {
    try {
      setUsers(await authClient.listUsers());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (tab !== "activity" || !isSuper) return;
    authClient
      .listAudit(100)
      .then(setAudit)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load activity"));
  }, [tab, isSuper, users]);

  const manageable = (u: UserRow) => Boolean(me) && u.id !== me!.id && canManage(me!.role, u.role);

  async function handleDelete() {
    const target = deleting;
    if (!target) return;
    setDeleting(null);
    try {
      await authClient.deleteUser(target.id);
      setNotice(`${target.username} was deleted.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <ShieldCheck className="size-5 text-primary" />
          User management
        </h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors"
        >
          <UserPlus className="size-4" />
          Add user
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {isSuper
          ? "You can add, edit, deactivate and delete Admins and Operators, reset their passwords and choose each Operator's modules."
          : "You can add and manage Operators: rename, reset password, choose their modules, deactivate or delete. Other Admins are view-only."}
      </p>

      {isSuper && (
        <div className="flex gap-1 rounded-xl bg-muted p-1 text-sm font-medium">
          {(["users", "activity"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {t === "users" ? "Users" : "Activity"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="flex items-start justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-foreground">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            ×
          </button>
        </p>
      )}

      {tab === "activity" && isSuper ? (
        <div className="space-y-1.5">
          {audit === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            audit.map((r, i) => (
              <div key={i} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                <p className="text-foreground">{describeAudit(r)}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {users === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users yet.</p>
          ) : (
            users.map((u) => {
              const canEdit = manageable(u);
              return (
                <div
                  key={u.id}
                  className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${u.isActive ? "" : "opacity-70"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{u.username}</span>
                        {u.id === me?.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            u.role === "operator" ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary"
                          }`}
                        >
                          {ROLE_LABEL[u.role]}
                        </span>
                        <span className="text-muted-foreground">{moduleSummary(u)}</span>
                        {!u.isActive && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">Deactivated</span>}
                      </p>
                    </div>

                    {canEdit ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <IconButton label={`Edit ${u.username}`} onClick={() => setEditing(u)}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Reset password for ${u.username}`} onClick={() => setResetting(u)}>
                          <KeyRound className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Delete ${u.username}`} danger onClick={() => setDeleting(u)}>
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </div>
                    ) : (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                        title={u.id === me?.id ? "Change your own password from the home screen" : "You can't manage this account"}
                      >
                        <Lock className="size-3.5" />
                        {u.id === me?.id ? "Your account" : "View only"}
                      </span>
                    )}
                  </div>
                  {u.role === "operator" && u.modules.length > 0 && u.modules.length < MODULES.length && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {MODULES.filter((m) => u.modules.includes(m.key))
                        .map((m) => m.label)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {creating && me && (
        <CreateUserModal
          actorRole={me.role}
          onClose={() => setCreating(false)}
          onDone={(name) => {
            setCreating(false);
            setNotice(`${name} was added. They sign in with the password you set. Give it to them privately.`);
            void refresh();
          }}
        />
      )}
      {editing && me && (
        <EditUserModal
          actorRole={me.role}
          target={editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            setNotice(msg);
            void refresh();
          }}
          onChanged={() => void refresh()}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          target={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setNotice(`Password reset for ${resetting.username}. They sign in with the password you set. Give it to them privately.`);
            setResetting(null);
            void refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.username ?? "this user"}?`}
        message="Their login is removed for good and this can't be undone. Records they created stay in History under their name. If they have only left the company, use Edit → Deactivate instead, which can be reversed."
        confirmLabel="Delete user"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-xl border p-2 transition-colors ${
        danger ? "border-danger-border bg-danger-soft text-danger" : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-card p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  username,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  username?: string;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const problem = value ? passwordProblem(value, username) : null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available (some WebViews): the password is visible, so it can be read out.
      setShow(true);
    }
  }
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        <RequiredMark />
      </span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs font-medium">
        <button
          type="button"
          onClick={() => {
            onChange(generateTemporaryPassword());
            setShow(true);
          }}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <RefreshCw className="size-3" /> Generate
        </button>
        <button type="button" disabled={!value} onClick={copy} className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-40">
          <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {problem ? (
        <p className="text-xs text-danger">{problem}</p>
      ) : (
        <p className="text-xs text-muted-foreground">They will always use this password and cannot change it themselves. Give it to them privately.</p>
      )}
    </div>
  );
}

function CreateUserModal({ actorRole, onClose, onDone }: { actorRole: Role; onClose: () => void; onDone: (name: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "admin">("operator");
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const uProblem = username ? usernameProblem(username) : null;
  const pProblem = passwordProblem(password, username);
  const needsModules = role === "operator";
  const valid = !usernameProblem(username) && !pProblem && (!needsModules || modules.length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      await authClient.createUser({ username: username.trim(), password, role, modules: needsModules ? modules : [] });
      onDone(username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
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
            autoComplete="off"
            required
            className={inputClass}
          />
          {uProblem && <p className="text-xs text-danger">{uProblem}</p>}
        </label>

        <PasswordField label="Password" value={password} onChange={setPassword} username={username} />

        {actorRole === "super_admin" ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Role</span>
            <SelectMenu
              value={role}
              placeholder="Select role"
              options={[
                { value: "operator", label: `Operator - ${ROLE_NOTE.operator}` },
                { value: "admin", label: `Admin - ${ROLE_NOTE.admin}` },
              ]}
              onChange={(v) => setRole(v as "operator" | "admin")}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">New accounts you add are Operators.</p>
        )}

        {needsModules ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Modules this Operator can use
              <RequiredMark />
            </span>
            <ModulePicker value={modules} onChange={setModules} />
            {modules.length === 0 && <p className="text-xs text-muted-foreground">Choose at least one module.</p>}
          </div>
        ) : (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">Admins automatically get every module.</p>
        )}

        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !valid} className={primaryBtn}>
            {submitting ? "Adding..." : "Add user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  actorRole,
  target,
  onClose,
  onDone,
  onChanged,
}: {
  actorRole: Role;
  target: UserRow;
  onClose: () => void;
  onDone: (message: string) => void;
  onChanged: () => void;
}) {
  const [username, setUsername] = useState(target.username);
  const [role, setRole] = useState<"operator" | "admin">(target.role === "admin" ? "admin" : "operator");
  const [modules, setModules] = useState<ModuleKey[]>(target.modules);
  const [active, setActive] = useState(target.isActive);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canChangeRole = actorRole === "super_admin";
  const finalRole: Role = canChangeRole ? role : target.role;
  const uProblem = usernameProblem(username);

  const changes = useMemo(() => {
    const sameModules = JSON.stringify([...modules].sort()) === JSON.stringify([...target.modules].sort());
    return {
      rename: username.trim() !== target.username,
      role: canChangeRole && role !== target.role,
      modules: finalRole === "operator" && (!sameModules || (canChangeRole && role !== target.role)),
      active: active !== target.isActive,
    };
  }, [username, role, modules, active, target, canChangeRole, finalRole]);
  const anything = Object.values(changes).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (uProblem || !anything) return;
    setError(null);
    setSubmitting(true);
    const done: string[] = [];
    try {
      if (changes.rename) { await authClient.renameUser(target.id, username.trim()); done.push("username"); }
      if (changes.role) { await authClient.setUserRole(target.id, role); done.push("role"); }
      if (changes.modules) { await authClient.setUserModules(target.id, modules); done.push("modules"); }
      if (changes.active) { await authClient.setUserActive(target.id, active); done.push(active ? "reactivated" : "deactivated"); }
      onDone(`Saved changes for ${username.trim()}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(done.length ? `${msg}. Already saved: ${done.join(", ")}.` : msg);
      if (done.length) onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${target.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Username
            <RequiredMark />
          </span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required className={inputClass} />
          {uProblem && <p className="text-xs text-danger">{uProblem}</p>}
          {changes.rename && (
            <p className="text-xs text-muted-foreground">Old records keep the previous name ({target.username}); only future activity uses the new one.</p>
          )}
        </label>

        {canChangeRole ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Role</span>
            <SelectMenu
              value={role}
              placeholder="Select role"
              options={[
                { value: "operator", label: `Operator - ${ROLE_NOTE.operator}` },
                { value: "admin", label: `Admin - ${ROLE_NOTE.admin}` },
              ]}
              onChange={(v) => setRole(v as "operator" | "admin")}
            />
            {changes.role && <p className="text-xs text-muted-foreground">They will be signed out and must sign in again to use the new role.</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Role: {ROLE_LABEL[target.role]}</p>
        )}

        {finalRole === "operator" ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Modules this Operator can use</span>
            <ModulePicker value={modules} onChange={setModules} />
            {modules.length === 0 && <p className="text-xs text-muted-foreground">With no modules selected they can sign in but see nothing.</p>}
          </div>
        ) : (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">Admins automatically have every module.</p>
        )}

        <label className="flex items-start gap-2.5 rounded-xl border border-border p-3">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-0.5 size-4" />
          <span>
            <span className="block text-sm font-medium text-foreground">Account is active</span>
            <span className="block text-xs text-muted-foreground">
              Untick to deactivate: they are signed out at once and can't sign in. Their history is kept, and you can reactivate them later.
            </span>
          </span>
        </label>

        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || Boolean(uProblem) || !anything} className={primaryBtn}>
            {submitting ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ target, onClose, onDone }: { target: UserRow; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const valid = passwordProblem(password, target.username) === null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      await authClient.resetUserPassword(target.id, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset the password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Reset password for ${target.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Their current password stops working and they are signed out everywhere. They will use the password you set below; they cannot change it themselves, so give it to them privately. You can never see anyone's existing password.
        </p>
        <PasswordField label="New password" value={password} onChange={setPassword} username={target.username} />
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !valid} className={primaryBtn}>
            {submitting ? "Resetting..." : "Reset password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
