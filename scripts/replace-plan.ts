// Decides what scripts/replace-users.mjs would change. Pure functions, no database, so the
// rules can be tested (tests/user-management/replace-plan.test.ts).

export interface Profile {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
}

export interface Plan {
  superId: string;
  renameFrom: string;
  renameTo: string;
  /** True when the Super Admin's username has to change. */
  rename: boolean;
  /** The Admin to keep already exists (a re-run): nothing to create. */
  adminId: string | null;
  /** Every other account: these are the ones that would be removed. */
  remove: { id: string; username: string; role: string }[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function planReplacement(
  profiles: Profile[] | null | undefined,
  superName: string,
  adminName: string,
): { plan?: Plan; error?: string } {
  if (!Array.isArray(profiles)) return { error: "The profiles could not be read." };
  if (same(superName, adminName)) return { error: "The Super Admin and Admin usernames must differ." };

  const supers = profiles.filter((p) => p.role === "super_admin");
  if (supers.length !== 1) return { error: `Expected exactly 1 Super Admin, found ${supers.length}.` };
  const sup = supers[0];
  if (sup.is_active !== true) return { error: "The Super Admin is not active." };

  // The new Super Admin name may only be used by the Super Admin itself.
  const clash = profiles.find((p) => p.id !== sup.id && same(p.username, superName));
  if (clash) return { error: `The username "${superName}" is already used by another account. Nothing was changed.` };

  // The Admin may already exist (re-run); it must then be an active Admin.
  const existing = profiles.find((p) => same(p.username, adminName));
  if (existing) {
    if (existing.id === sup.id) return { error: `"${adminName}" is the Super Admin's own username.` };
    if (existing.role !== "admin") return { error: `"${adminName}" already exists as a ${existing.role}, not an Admin.` };
    if (existing.is_active !== true) return { error: `"${adminName}" exists but is not active.` };
  }

  const keep = new Set([sup.id, existing?.id].filter(Boolean) as string[]);
  return {
    plan: {
      superId: sup.id,
      renameFrom: sup.username,
      renameTo: superName,
      rename: sup.username !== superName,
      adminId: existing?.id ?? null,
      remove: profiles.filter((p) => !keep.has(p.id)).map((p) => ({ id: p.id, username: p.username, role: p.role })),
    },
  };
}
