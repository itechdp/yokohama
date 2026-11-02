import type { SessionUser } from "@/lib/auth-client";
import { FEATURE_ITEMS, type NavItem } from "@/lib/nav-items";
import type { ModuleKey } from "@/lib/user-policy";

// The permission decisions the screens make, kept as plain functions so they can be tested
// for every role and route. The database makes the same decisions again on every request;
// these only decide what to show and where to redirect.

export function isStaffRole(user: Pick<SessionUser, "role"> | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "super_admin";
}

export function canUseModule(user: Pick<SessionUser, "role" | "modules"> | null | undefined, module: ModuleKey): boolean {
  if (!user) return false;
  return isStaffRole(user) || user.modules.includes(module);
}

export type AccessDecision = "loading" | "login" | "no-access" | "allow";

export function isSuperAdmin(user: Pick<SessionUser, "role"> | null | undefined): boolean {
  return user?.role === "super_admin";
}

export function decideAccess(args: {
  user: SessionUser | null;
  loading: boolean;
  module?: ModuleKey;
  staffOnly?: boolean;
  superOnly?: boolean;
}): AccessDecision {
  const { user, loading, module, staffOnly, superOnly } = args;
  if (loading) return "loading";
  if (!user) return "login";
  if (superOnly && !isSuperAdmin(user)) return "no-access";
  if (staffOnly && !isStaffRole(user)) return "no-access";
  if (module && !canUseModule(user, module)) return "no-access";
  return "allow";
}

/** The home-screen tiles this person may see. */
export function visibleNavItems(user: Pick<SessionUser, "role" | "modules"> | null | undefined): NavItem[] {
  return FEATURE_ITEMS.filter((item) =>
    item.staffOnly ? isStaffRole(user) : !item.module || canUseModule(user, item.module),
  );
}
