// One-off: leave exactly TWO accounts in the new user system:
//   * the existing Super Admin, renamed (same id, so all history stays linked to it), with a new password
//   * one Admin (new)
// and remove every other account from the new system (app_profiles + their module rows + any Auth account).
//
//   source ~/.yokohama-secrets/prod.env; source ~/.yokohama-secrets/new-accounts.env   (exported variables)
//   node scripts/replace-users.mjs --production                              (dry run: shows the plan, writes nothing)
//   node scripts/replace-users.mjs --production --apply --expect-delete=<N>  (N = the number shown by the dry run)
//
// What it NEVER touches:
//   * business tables (tires, stock, locations, history, ...): only COUNTED, before and after
//   * the legacy public.users table and its password hashes (kept for rollback; remove later, separately)
// Safety:
//   * Dry run by default. --apply also needs --expect-delete=<N> equal to the number of accounts it would remove.
//   * It refuses the production project unless --production AND CONFIRM_PRODUCTION="I have written approval".
//   * Passwords come from the environment only and are never printed. The Super Admin and Admin must both
//     pass the app's password rules (10+ characters, ...) before anything is contacted.
//   * Before the first change it writes a private backup (ids, names, roles, modules; no passwords) of the
//     accounts it will remove.
//   * Re-running is safe: when the end state is already reached it does nothing.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { passwordProblem, syntheticEmail, usernameProblem } from "../supabase/functions/_shared/policy.ts";
import { planReplacement } from "./replace-plan.ts";

const PRODUCTION_REF = "rqpdoyyqiyzbswaxxqjc";
const BUSINESS_TABLES = [
  "tires", "tire_skus", "warehouses", "inward_pending", "inward_receipts", "placement_logs", "tire_history",
  "picks", "deleted_tires", "outwards", "plan_numbers", "prepared_plans", "plan_pending_tires",
  "plan_block_tires", "bay_bookings", "bay_plan_history",
];

const argv = process.argv.slice(2);
const args = new Set(argv);
const apply = args.has("--apply");
const expectArg = argv.find((a) => a.startsWith("--expect-delete="));
const expectDelete = expectArg ? Number(expectArg.slice("--expect-delete=".length)) : null;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superName = (process.env.NEW_SUPER_USERNAME ?? "").trim();
const superPassword = process.env.NEW_SUPER_PASSWORD ?? "";
const adminName = (process.env.NEW_ADMIN_USERNAME ?? "").trim();
const adminPassword = process.env.NEW_ADMIN_PASSWORD ?? "";

const stop = (code, msg) => { console.error(msg); process.exit(code); };

if (!url || !key) stop(2, "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
if (!superName || !adminName) stop(2, "Set NEW_SUPER_USERNAME and NEW_ADMIN_USERNAME.");

// ---- Local checks first: nothing is contacted until these pass ----------------------------------
const problems = [
  usernameProblem(superName) && `Super Admin username: ${usernameProblem(superName)}`,
  usernameProblem(adminName) && `Admin username: ${usernameProblem(adminName)}`,
  !superPassword ? "Super Admin password is not set (NEW_SUPER_PASSWORD)." : passwordProblem(superPassword, superName) && `Super Admin password: ${passwordProblem(superPassword, superName)}`,
  !adminPassword ? "Admin password is not set (NEW_ADMIN_PASSWORD)." : passwordProblem(adminPassword, adminName) && `Admin password: ${passwordProblem(adminPassword, adminName)}`,
].filter(Boolean);
if (problems.length) {
  console.error("Cannot continue. Nothing was contacted or changed:");
  for (const p of problems) console.error("  - " + p);
  process.exit(2);
}

const isProduction = url.includes(PRODUCTION_REF);
if (isProduction && !(args.has("--production") && process.env.CONFIRM_PRODUCTION === "I have written approval")) {
  stop(2, "Refusing to run: this is the PRODUCTION project. It needs --production and CONFIRM_PRODUCTION set.");
}
if (apply && (expectDelete === null || !Number.isInteger(expectDelete) || expectDelete < 0)) {
  stop(2, "--apply also needs --expect-delete=<N>, the number of accounts the dry run says it will remove.");
}
console.log(`Target: ${isProduction ? "PRODUCTION" : "non-production"} (${new URL(url).hostname}) - ${apply ? "APPLY" : "dry run"}`);
console.log("Password rules: both new passwords pass.");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- Read the current state ---------------------------------------------------------------------
const { data: profiles, error: profErr } = await db.from("app_profiles").select("id, username, role, is_active");
if (profErr) stop(1, `Could not read profiles: ${profErr.message}. Nothing was changed.`);
const { plan, error: planErr } = planReplacement(profiles, superName, adminName);
if (planErr) stop(1, `Cannot continue: ${planErr} Nothing was changed.`);

let moduleRows = [];
if (plan.remove.length) {
  const { data, error } = await db.from("app_user_modules").select("user_id, module_key").in("user_id", plan.remove.map((r) => r.id));
  if (error) stop(1, `Could not read module rows: ${error.message}. Nothing was changed.`);
  moduleRows = data ?? [];
}

async function countBusiness() {
  const out = {};
  for (const t of BUSINESS_TABLES) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
    out[t] = error ? null : count;
  }
  return out;
}
const before = await countBusiness();
const unreadable = Object.entries(before).filter(([, v]) => v === null).map(([k]) => k);

// ---- Show the plan ------------------------------------------------------------------------------
console.log("\nPlan:");
console.log(`  Super Admin : "${plan.renameFrom}" -> "${plan.renameTo}"   (same account id, so its history stays linked)`);
console.log(`  Admin       : "${adminName}"  (${plan.adminId ? "already exists, kept" : "will be created"})`);
console.log(`  Remove      : ${plan.remove.length} account(s) from the new user system`);
for (const r of plan.remove) console.log(`     - ${r.username}  (${r.role}, ${moduleRows.filter((m) => m.user_id === r.id).length} module rows)`);
console.log("  Not touched : public.users (old table + old password hashes) and every business table");
console.log("  Business row counts now: " + BUSINESS_TABLES.map((t) => `${t}=${before[t] ?? "?"}`).join(" "));
if (unreadable.length) console.log(`  (could not count: ${unreadable.join(", ")})`);

if (!apply) {
  console.log(`\nDry run only: nothing was written. To apply, add --apply --expect-delete=${plan.remove.length}`);
  process.exit(0);
}
if (!plan.rename && plan.adminId && plan.remove.length === 0) {
  // A re-run must not reset passwords the two people have since chosen for themselves.
  console.log("\nAlready in the desired state (exactly the two accounts). Nothing to do; no password was touched.");
  process.exit(0);
}
if (expectDelete !== plan.remove.length) {
  stop(1, `Refusing: you expected ${expectDelete} removals but the plan has ${plan.remove.length}. Nothing was changed.`);
}
if (unreadable.length) stop(1, `Refusing: could not count ${unreadable.join(", ")} so the before/after check would be incomplete. Nothing was changed.`);

// ---- Apply --------------------------------------------------------------------------------------
const dir = process.env.BACKUP_DIR || join(homedir(), ".yokohama-secrets");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const backupFile = join(dir, `removed-accounts-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(
  backupFile,
  JSON.stringify({ taken_at: new Date().toISOString(), note: "No passwords or hashes.", accounts: plan.remove.map((r) => ({ ...r, modules: moduleRows.filter((m) => m.user_id === r.id).map((m) => m.module_key) })) }, null, 2),
  { mode: 0o600 },
);
chmodSync(backupFile, 0o600);
console.log(`\nBackup of the accounts to be removed written to: ${backupFile}`);

const must = (step, res) => { if (res.error) stop(1, `FAILED at "${step}": ${res.error.message}. Stopped. Business data was not touched.`); };

// 1. Auth account for the Super Admin (same id), with the new password.
const existing = await db.auth.admin.getUserById(plan.superId);
if (existing.data?.user) {
  must("update Super Admin login", await db.auth.admin.updateUserById(plan.superId, { password: superPassword, email: syntheticEmail(plan.superId), email_confirm: true }));
} else {
  const c = await db.auth.admin.createUser({ id: plan.superId, email: syntheticEmail(plan.superId), password: superPassword, email_confirm: true });
  must("create Super Admin login", c);
  if (c.data?.user?.id !== plan.superId) stop(1, "FAILED: Auth gave the Super Admin a different id. Stopped; nothing else was changed.");
}
console.log("  ok  Super Admin login ready (id unchanged)");

// 2. Rename the Super Admin profile.
const ren = await db.from("app_profiles").update({ username: plan.renameTo }).eq("id", plan.superId).eq("role", "super_admin").select("id");
must("rename Super Admin", ren);
if (!ren.data || ren.data.length !== 1) stop(1, "FAILED: the Super Admin rename did not update exactly one row. Stopped.");
console.log(`  ok  Super Admin is now "${plan.renameTo}"`);
if (plan.rename) {
  const au = await db.rpc("app_audit_write", { p_actor: plan.superId, p_action: "user_renamed", p_target: plan.superId, p_target_username: plan.renameTo, p_details: { old_username: plan.renameFrom, new_username: plan.renameTo } });
  if (au.error) console.log(`  note audit entry for the rename could not be written (${au.error.message}); the rename itself is done`);
}

// 3. The new Admin.
let adminId = plan.adminId;
if (!adminId) {
  adminId = randomUUID();
  const c = await db.auth.admin.createUser({ id: adminId, email: syntheticEmail(adminId), password: adminPassword, email_confirm: true });
  must("create Admin login", c);
  if (c.data?.user?.id !== adminId) {
    await db.auth.admin.deleteUser(c.data.user.id);
    stop(1, "FAILED: Auth gave the Admin a different id; that login was undone. Stopped.");
  }
  const reg = await db.rpc("app_register_profile", { p_id: adminId, p_username: adminName, p_role: "admin", p_modules: [], p_created_by: plan.superId });
  if (reg.error) {
    await db.auth.admin.deleteUser(adminId); // no half-created account
    stop(1, `FAILED at "create Admin profile": ${reg.error.message}. The Admin login was undone. Stopped.`);
  }
  console.log(`  ok  Admin "${adminName}" created`);
} else {
  console.log(`  ok  Admin "${adminName}" already exists`);
}

// 4. Remove every other account.
for (const r of plan.remove) {
  must(`remove ${r.username}`, await db.rpc("app_finalize_delete", { p_actor: plan.superId, p_target: r.id }));
  const del = await db.auth.admin.deleteUser(r.id);
  if (del.error && !/not.?found/i.test(del.error.message ?? "")) stop(1, `FAILED removing the login of ${r.username}: ${del.error.message}. Stopped.`);
  console.log(`  ok  removed ${r.username} (${r.role})`);
}

// ---- Verify -------------------------------------------------------------------------------------
const { data: after, error: afterErr } = await db.from("app_profiles").select("id, username, role, is_active");
if (afterErr) stop(1, `Could not verify: ${afterErr.message}`);
const shape = after.map((p) => `${p.username}:${p.role}:${p.is_active ? "active" : "INACTIVE"}`).sort();
const okShape = after.length === 2 && after.some((p) => p.id === plan.superId && p.username === plan.renameTo && p.role === "super_admin" && p.is_active) && after.some((p) => p.id === adminId && p.role === "admin" && p.is_active);
const sa = await db.auth.admin.getUserById(plan.superId);
const aa = await db.auth.admin.getUserById(adminId);
const countsAfter = await countBusiness();
const countsSame = BUSINESS_TABLES.every((t) => countsAfter[t] === before[t]);

console.log("\nVerification:");
console.log(`  Accounts now: ${shape.join(", ")}  -> ${okShape ? "OK (exactly the two wanted)" : "NOT AS EXPECTED"}`);
console.log(`  Auth logins exist for both: ${sa.data?.user && aa.data?.user ? "yes" : "NO"}`);
console.log(`  Business row counts unchanged: ${countsSame ? "yes (all " + BUSINESS_TABLES.length + " tables)" : "NO - CHECK IMMEDIATELY"}`);
console.log("  Both accounts sign in with the passwords you set. Only the Super Admin can change their own password later.");
if (!okShape || !sa.data?.user || !aa.data?.user || !countsSame) process.exit(1);
