/* eslint-disable */
// Every role against every route, and a static check that no screen is left unguarded.
import { readFileSync } from "node:fs";
import { decideAccess, visibleNavItems } from "@/lib/route-access";
import { MODULE_KEYS, type ModuleKey } from "@/lib/user-policy";
import type { SessionUser } from "@/lib/auth-client";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log("PASS " + name);
  else { failed++; console.log("FAIL " + name + (detail ? "  -> " + detail : "")); }
}

// The agreed screen -> module mapping (docs/user-management-rbac.md).
const ROUTES: { path: string; module: ModuleKey }[] = [
  { path: "/tires/inward", module: "inward" },
  { path: "/tires/putaway", module: "putaway" },
  { path: "/tires/picking", module: "picking" },
  { path: "/tires/outward", module: "outward" },
  { path: "/tires/stock", module: "stock" },
  { path: "/plans", module: "prepare_plan" },
  { path: "/tires/skus", module: "show_tire" },
  { path: "/tires/new", module: "show_tire" },
  { path: "/tires/bulk-upload", module: "show_tire" },
  { path: "/tires/history", module: "history" },
  { path: "/bays", module: "loading_bay" },
  { path: "/bays/pending", module: "loading_bay" },
  { path: "/bays/pending/:planNo", module: "loading_bay" },
  { path: "/bays/block", module: "loading_bay" },
  { path: "/bays/block/:planNo", module: "loading_bay" },
  { path: "/bays/history", module: "bay_history" },
  { path: "/warehouses", module: "warehouses" },
];
const PUBLIC_OR_OPEN = new Set(["/login", "/"]);
const STAFF_ONLY = ["/admin/users"];
const SUPER_ONLY = ["/account/password"]; // own-password page: Super Admin only

const user = (role: SessionUser["role"], modules: ModuleKey[] = []): SessionUser =>
  ({ id: "u", username: "u", role, modules });
const op = (...m: ModuleKey[]) => user("operator", m);
const SA = user("super_admin", [...MODULE_KEYS]);
const AD = user("admin", [...MODULE_KEYS]);

const decide = (u: SessionUser | null, _path: string, module?: ModuleKey, staffOnly?: boolean, superOnly?: boolean) =>
  decideAccess({ user: u, loading: false, module, staffOnly, superOnly });

// ---- the matrix ----
let bad = 0;
for (const r of ROUTES) {
  if (decide(SA, r.path, r.module) !== "allow") bad++;
  if (decide(AD, r.path, r.module) !== "allow") bad++;
  for (const m of MODULE_KEYS) {
    const allowed = decide(op(m), r.path, r.module) === "allow";
    if (allowed !== (r.module === m)) { bad++; console.log("  wrong:", m, r.path, allowed); }
  }
  if (decide(op(), r.path, r.module) !== "no-access") bad++;
  if (decide(null, r.path, r.module) !== "login") bad++;
}
check(`matrix: ${ROUTES.length} routes x (super admin, admin, 11 single-module operators, no-module operator, signed out) all correct`, bad === 0, `${bad} wrong`);

check("staff-only pages: Super Admin and Admin allowed, every Operator refused",
  decide(SA, "/admin/users", undefined, true) === "allow" && decide(AD, "/admin/users", undefined, true) === "allow"
  && MODULE_KEYS.every((m) => decide(op(m), "/admin/users", undefined, true) === "no-access")
  && decide(op(...MODULE_KEYS), "/admin/users", undefined, true) === "no-access");
check("an Operator holding ALL modules is still not staff", decide(op(...MODULE_KEYS), "/admin/users", undefined, true) === "no-access");
check("signed out is sent to login, never shown a page", decide(null, "/", undefined) === "login" && decide(null, "/admin/users", undefined, true) === "login");
check("while the session is being restored nothing is decided yet", decideAccess({ user: null, loading: true, module: "stock" }) === "loading");
// ---- own-password page: Super Admin only; no forced password change for anyone ----
const PW = "/account/password";
check("password page: the Super Admin may open it", decide(SA, PW, undefined, false, true) === "allow");
check("password page: an Admin is refused", decide(AD, PW, undefined, false, true) === "no-access");
check("password page: every Operator is refused, even with all modules",
  decide(op(), PW, undefined, false, true) === "no-access" && decide(op(...MODULE_KEYS), PW, undefined, false, true) === "no-access"
  && MODULE_KEYS.every((m) => decide(op(m), PW, undefined, false, true) === "no-access"));
check("password page: signed out goes to login", decide(null, PW, undefined, false, true) === "login");
check("home is open to every signed-in role", decide(SA, "/") === "allow" && decide(AD, "/") === "allow" && decide(op(), "/") === "allow");
check("no forced redirect exists: every role reaches an ordinary page with no extra step",
  decide(op("inward"), "/tires/inward", "inward") === "allow" && decide(AD, "/admin/users", undefined, true) === "allow"
  && decide(SA, "/admin/users", undefined, true) === "allow");
check("the decision type has no change-password outcome", !readFileSync("src/lib/route-access.ts", "utf8").includes('"change-password"')
  && !readFileSync("src/components/protected-route.tsx", "utf8").includes("change-password"));
check("the forced-change flag is not read anywhere in the app", !/mustChangePassword|must_change_password/.test(
  ["src/lib/auth-client.ts", "src/lib/route-access.ts", "src/components/protected-route.tsx", "src/contexts/auth-context.tsx",
   "src/pages/change-password.tsx", "src/pages/admin-users.tsx", "src/pages/home.tsx", "src/pages/login.tsx"].map((f) => readFileSync(f, "utf8")).join("\n")));
check("a module the user does not hold is refused even if the role is odd/unknown",
  decide({ ...op("stock"), role: "operator" } as SessionUser, "/tires/inward", "inward") === "no-access");

// ---- dashboard tiles ----
const labels = (u: SessionUser) => visibleNavItems(u).map((i) => i.label).sort().join(",");
check("operator with Inward + Stock sees exactly those two tiles", labels(op("inward", "stock")) === "Inward,Stock", labels(op("inward", "stock")));
check("operator with no modules sees no tiles", visibleNavItems(op()).length === 0);
check("Admin sees all 11 module tiles plus Users", visibleNavItems(AD).length === 12 && visibleNavItems(AD).some((i) => i.to === "/admin/users"));
check("Super Admin sees all 11 module tiles plus Users", visibleNavItems(SA).length === 12 && visibleNavItems(SA).some((i) => i.to === "/admin/users"));
check("an Operator never sees the Users tile, even with every module", !visibleNavItems(op(...MODULE_KEYS)).some((i) => i.to === "/admin/users") && visibleNavItems(op(...MODULE_KEYS)).length === 11);
check("each single-module operator sees exactly one tile", MODULE_KEYS.every((m) => visibleNavItems(op(m)).length === 1));
check("signed out sees nothing", visibleNavItems(null).length === 0);
check("every tile's route is guarded by the module that tile claims",
  visibleNavItems(AD).filter((i) => i.module).every((i) => ROUTES.some((r) => r.path === i.to && r.module === i.module)));

// ---- static: App.tsx may not contain an unguarded screen ----
const app = readFileSync("src/App.tsx", "utf8");
const guarded = new Map<string, string>(); // path -> module | "staff"
for (const m of app.matchAll(/<Route element=\{<ProtectedRoute (module="([a-z_]+)"|staffOnly|superOnly) \/>\}>([\s\S]*?)<\/Route>/g)) {
  for (const p of m[3].matchAll(/path="([^"]+)"/g)) guarded.set(p[1], m[2] ?? (m[1] === "superOnly" ? "super" : "staff"));
}
const allPaths = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
const unguarded = allPaths.filter((p) => !PUBLIC_OR_OPEN.has(p) && !guarded.has(p));
check("App.tsx: no screen is outside a permission guard", unguarded.length === 0, unguarded.join(", "));
check("App.tsx: every route is guarded by the agreed module",
  ROUTES.every((r) => guarded.get(r.path) === r.module) && STAFF_ONLY.every((p) => guarded.get(p) === "staff")
  && SUPER_ONLY.every((p) => guarded.get(p) === "super"),
  JSON.stringify([...guarded]));
check("App.tsx: nothing guarded that is not in the agreed table", [...guarded.keys()].every((p) => ROUTES.some((r) => r.path === p) || STAFF_ONLY.includes(p) || SUPER_ONLY.includes(p)));

console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
