// Rules shared by the Edge Functions and the app screens. Pure functions only (no Deno,
// no browser APIs) so the same file can run in both and be unit-tested.
//
// The database enforces the same rules again (rbac_02_functions.sql). These checks give
// early, readable errors; they are never the only line of defence.

export type Role = "super_admin" | "admin" | "operator";

export const MODULE_KEYS = [
  "inward",
  "putaway",
  "picking",
  "outward",
  "stock",
  "prepare_plan",
  "show_tire",
  "history",
  "loading_bay",
  "bay_history",
  "warehouses",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MIN_PASSWORD_LENGTH = 10;
// bcrypt ignores everything after 72 bytes, so longer passwords would silently weaken.
export const MAX_PASSWORD_BYTES = 72;

export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;

export const USERNAME_RULE = "Username must be 3-64 characters: letters, numbers, dot, dash or underscore";

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string, username?: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  if (password.trim() !== password) {
    return "Password cannot start or end with a space";
  }
  if (new Set(password).size < 4) {
    return "Password is too repetitive";
  }
  if (username && password.toLowerCase().includes(username.trim().toLowerCase()) && username.trim().length >= 3) {
    return "Password cannot contain the username";
  }
  return null;
}

export function usernameProblem(username: string): string | null {
  return typeof username === "string" && USERNAME_PATTERN.test(username.trim()) ? null : USERNAME_RULE;
}

/** Who may manage whom (rename, modules, deactivate, reset password, delete). */
export function canManage(actor: Role, target: Role): boolean {
  if (actor === "super_admin") return target === "admin" || target === "operator";
  if (actor === "admin") return target === "operator";
  return false;
}

/** Which role an actor may create. Nobody can ever create a Super Admin. */
export function canCreate(actor: Role, newRole: Role): boolean {
  if (newRole === "operator") return actor === "super_admin" || actor === "admin";
  if (newRole === "admin") return actor === "super_admin";
  return false;
}

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value);
}

/** Auth accounts use a synthetic address built from the user id, so renaming a user never touches Auth. */
export function syntheticEmail(userId: string): string {
  return `${userId.toLowerCase()}@users.yokohama.invalid`;
}

/** Same message for unknown user, wrong password and deactivated account. */
export const LOGIN_FAILED = "Invalid username or password";
export const LOGIN_LOCKED = "Too many failed attempts. Try again in 15 minutes.";
