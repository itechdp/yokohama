/* eslint-disable */
// Unit tests for the user-management rules and the three Edge Function handlers, using
// fakes in place of Supabase. The database rules themselves are tested against a real
// Postgres (see docs/user-management-rbac.md, "Testing").
import {
  MODULE_KEYS, canCreate, canManage, passwordProblem, syntheticEmail, usernameProblem,
} from "../../supabase/functions/_shared/policy.ts";
import {
  handleAdminUsers, handleChangePassword, handleLogin, jwtClaim, type DbClient, type Deps, type Req,
} from "../../supabase/functions/_shared/handlers.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log("PASS " + name);
  else { failed++; console.log("FAIL " + name + (detail ? "  -> " + detail : "")); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------- policy ----------
check("password: 9 characters rejected", passwordProblem("abcdefghi") !== null);
check("password: exactly 10 characters accepted", passwordProblem("abcd-efg12") === null);
check("password: 72 bytes ok, 73 bytes rejected", passwordProblem("abcdefghij".repeat(7) + "ab") === null && passwordProblem("abcdefghij".repeat(7) + "abc") !== null);
check("password: multibyte counted in bytes", passwordProblem("é".repeat(37)) !== null);
check("password: leading/trailing space rejected", passwordProblem(" abcd-efg12") !== null);
check("password: repetitive rejected", passwordProblem("aaaaaaaaaa") !== null && passwordProblem("ababababab") !== null);
check("password: containing username rejected", passwordProblem("xxmehul-2026!", "mehul") !== null);
check("username: rules", usernameProblem("ab") !== null && usernameProblem("a b c") !== null && usernameProblem("op_1.x-2") === null);
check("hierarchy: super admin manages admin+operator only",
  canManage("super_admin", "admin") && canManage("super_admin", "operator") && !canManage("super_admin", "super_admin"));
check("hierarchy: admin manages operators only",
  canManage("admin", "operator") && !canManage("admin", "admin") && !canManage("admin", "super_admin"));
check("hierarchy: operator manages nobody", !canManage("operator", "operator") && !canManage("operator", "admin"));
check("create: nobody can create a super admin",
  !canCreate("super_admin", "super_admin") && !canCreate("admin", "super_admin") && !canCreate("operator", "super_admin"));
check("create: only super admin creates admins", canCreate("super_admin", "admin") && !canCreate("admin", "admin"));
check("create: admin and super admin create operators", canCreate("admin", "operator") && canCreate("super_admin", "operator") && !canCreate("operator", "operator"));
check("11 modules", MODULE_KEYS.length === 11);
check("synthetic email is id based", syntheticEmail("ABC-1") === "abc-1@users.yokohama.invalid");

// ---------- fakes ----------
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const TOKEN = `h.${b64({ session_id: "sess-123", sub: "u1" })}.s`;
const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

interface World {
  calls: { fn: string; args?: any }[];
  signIns: { email: string; password: string }[];
  created: any[]; updated: { id: string; attrs: any }[]; deleted: string[];
  check: { user_id: string | null; active: boolean; locked: boolean };
  signInOk: boolean;
  tokenUser: { id: string; email: string } | null;
  me: any[] | null;
  authorize: any | null;          // null => database refuses
  registerError: string | null;
  createUserError: string | null; createUserId: string | null;
  deleteError: string | null;
  afterErr: boolean;
}
function world(over: Partial<World> = {}): { w: World; deps: Deps } {
  const w: World = {
    calls: [], signIns: [], created: [], updated: [], deleted: [],
    check: { user_id: ACTOR, active: true, locked: false },
    signInOk: true, tokenUser: { id: ACTOR, email: "a@users.yokohama.invalid" },
    me: [{ id: ACTOR, username: "op1", role: "operator" }],
    authorize: { actor_id: ACTOR, actor_role: "admin", target_username: "op1" },
    registerError: null, createUserError: null, createUserId: null, deleteError: null, afterErr: false,
    ...over,
  };
  const rpc = (who: string) => async (fn: string, args?: any) => {
    w.calls.push({ fn, args });
    if (fn === "app_login_check") return { data: w.check, error: null };
    if (fn === "app_me") return { data: w.me, error: w.me ? null : { message: "x" } };
    if (fn === "app_authorize_manage") return w.authorize ? { data: w.authorize, error: null } : { data: null, error: { message: "Not allowed" } };
    if (fn === "app_register_profile") return { data: null, error: w.registerError ? { message: w.registerError } : null };
    if (fn === "app_after_password_reset" || fn === "app_finalize_delete" || fn === "app_after_password_change")
      return { data: null, error: w.afterErr ? { message: "boom" } : null };
    return { data: null, error: null };
  };
  const auth = {
    getUser: async (_t: string) => (w.tokenUser ? { data: { user: w.tokenUser }, error: null } : { data: { user: null }, error: { message: "bad" } }),
    signInWithPassword: async (c: { email: string; password: string }) => {
      w.signIns.push(c);
      return w.signInOk
        ? { data: { session: { access_token: "AT", refresh_token: "RT", expires_in: 3600, expires_at: 1, token_type: "bearer", user: { email: "leak@x" }, provider_token: "SECRET" } }, error: null }
        : { data: { session: null }, error: { message: "Invalid login credentials" } };
    },
    admin: {
      createUser: async (a: any) => {
        w.created.push(a);
        return w.createUserError
          ? { data: { user: null }, error: { message: w.createUserError } }
          : { data: { user: { id: w.createUserId ?? a.id } }, error: null };
      },
      updateUserById: async (id: string, attrs: any) => { w.updated.push({ id, attrs }); return { error: null }; },
      deleteUser: async (id: string) => { w.deleted.push(id); return { error: w.deleteError ? { message: w.deleteError } : null }; },
    },
  };
  const client = (who: string): DbClient => ({ rpc: rpc(who), auth } as unknown as DbClient);
  let n = 0;
  const deps: Deps = { svc: client("svc"), anon: () => client("anon"), asUser: () => client("user"), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
  return { w, deps };
}
const req = (body: unknown, token: string | null = TOKEN, ip = "1.2.3.4"): Req => ({
  headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? (token ? `Bearer ${token}` : null) : n.toLowerCase() === "x-forwarded-for" ? ip : null) },
  json: async () => { if (body === undefined) throw new Error("no body"); return body; },
});
const called = (w: World, fn: string) => w.calls.filter((c) => c.fn === fn);

async function main() {
  check("jwtClaim reads session_id", jwtClaim(TOKEN, "session_id") === "sess-123" && jwtClaim("garbage", "x") === null);

  // ---------- login ----------
  { const { w, deps } = world({ check: { user_id: ACTOR, active: true, locked: true } });
    const r = await handleLogin(req({ username: "op1", password: "x" }, null), deps);
    check("login: locked user gets 429 and no password attempt is made", r.status === 429 && w.signIns.length === 0); }
  { const { w, deps } = world({ check: { user_id: null, active: false, locked: false }, signInOk: false });
    const unknown = await handleLogin(req({ username: "ghost", password: "whatever-pass" }, null), deps);
    check("login: unknown user -> 401 generic, still does a dummy sign-in (same timing), failure recorded",
      unknown.status === 401 && unknown.body.error === "Invalid username or password" && w.signIns.length === 1 && called(w, "app_login_record")[0].args.p_success === false);
    const w2 = world({ check: { user_id: ACTOR, active: true, locked: false }, signInOk: false });
    const wrong = await handleLogin(req({ username: "op1", password: "wrong-password" }, null), w2.deps);
    const w3 = world({ check: { user_id: ACTOR, active: false, locked: false }, signInOk: true });
    const inactive = await handleLogin(req({ username: "op1", password: "right-password" }, null), w3.deps);
    check("login: unknown, wrong password and deactivated give IDENTICAL responses",
      eq(unknown, wrong) && eq(unknown, inactive), JSON.stringify([unknown, wrong, inactive]));
    check("login: deactivated account cannot sign in even with the right password", inactive.status === 401 && !("session" in inactive.body)); }
  { const { w, deps } = world();
    const r = await handleLogin(req({ username: "OP1 ", password: "right-password" }, null), deps);
    const s = (r.body.session ?? {}) as Record<string, unknown>;
    check("login: success -> 200 with only the five session fields (no user, provider tokens)",
      r.status === 200 && eq(Object.keys(s).sort(), ["access_token", "expires_at", "expires_in", "refresh_token", "token_type"]));
    check("login: success signs in with the id-based address, not the username", w.signIns[0].email === syntheticEmail(ACTOR));
    check("login: success is recorded", called(w, "app_login_record")[0].args.p_success === true);
    check("login: client address is passed for per-address lockout", called(w, "app_login_check")[0].args.p_ip === "1.2.3.4"); }
  { const { deps } = world();
    check("login: missing fields -> 400", (await handleLogin(req({ username: "a" }, null), deps)).status === 400);
    check("login: non-JSON body -> 400", (await handleLogin(req(undefined, null), deps)).status === 400);
    check("login: oversized username -> 400", (await handleLogin(req({ username: "x".repeat(65), password: "p" }, null), deps)).status === 400); }

  // ---------- change password (Super Admin only) ----------
  const SA_ME = [{ id: ACTOR, username: "meck", role: "super_admin" }];
  { const { deps } = world();
    check("change-password: no token -> 401", (await handleChangePassword(req({}, null), deps)).status === 401); }
  { const { deps } = world({ tokenUser: null });
    check("change-password: invalid token -> 401", (await handleChangePassword(req({ current_password: "a", new_password: "b" }), deps)).status === 401); }
  { const { deps } = world({ me: [] });
    check("change-password: deactivated/unknown profile -> 401", (await handleChangePassword(req({ current_password: "a", new_password: "long-enough-pass" }), deps)).status === 401); }
  for (const role of ["operator", "admin"]) {
    const { w, deps } = world({ me: [{ id: ACTOR, username: "someone", role }] });
    const r = await handleChangePassword(req({ current_password: "old-password-1", new_password: "brand-new-pass-1" }), deps);
    check(`change-password: ${role} -> 403, nothing verified, nothing changed, no sessions touched`,
      r.status === 403 && r.body.error === "Not allowed" && w.signIns.length === 0 && w.updated.length === 0
      && called(w, "app_after_password_change").length === 0 && called(w, "app_login_check").length === 0, JSON.stringify(r)); }
  { const { w, deps } = world({ me: [{ id: ACTOR, username: "x", role: "mystery" }] });
    const r = await handleChangePassword(req({ current_password: "old-password-1", new_password: "brand-new-pass-1" }), deps);
    check("change-password: an unknown role is refused too", r.status === 403 && w.updated.length === 0); }
  { const { w, deps } = world({ me: [{ id: ACTOR, username: "op1", role: "operator" }] });
    const r = await handleChangePassword(req({ current_password: "old-password-1", new_password: "brand-new-pass-1", role: "super_admin" }), deps);
    check("change-password: a role claimed in the request body is ignored", r.status === 403 && w.updated.length === 0); }
  { const { w, deps } = world({ me: SA_ME });
    const r = await handleChangePassword(req({ current_password: "old-password-1", new_password: "short" }), deps);
    check("change-password: weak new password -> 400 before any password check", r.status === 400 && w.signIns.length === 0); }
  { const { deps } = world({ me: SA_ME });
    check("change-password: same as current -> 400", (await handleChangePassword(req({ current_password: "same-password-1", new_password: "same-password-1" }), deps)).status === 400); }
  { const { deps } = world({ me: SA_ME, check: { user_id: ACTOR, active: true, locked: true } });
    check("change-password: locked -> 429", (await handleChangePassword(req({ current_password: "old-password-1", new_password: "brand-new-pass-1" }), deps)).status === 429); }
  { const { w, deps } = world({ me: SA_ME, signInOk: false });
    const r = await handleChangePassword(req({ current_password: "wrong-current", new_password: "brand-new-pass-1" }), deps);
    check("change-password: wrong current password -> 401, nothing changed, failure recorded",
      r.status === 401 && w.updated.length === 0 && called(w, "app_login_record")[0].args.p_success === false); }
  { const { w, deps } = world({ me: SA_ME });
    const r = await handleChangePassword(req({ current_password: "old-password-1", new_password: "brand-new-pass-1" }), deps);
    check("change-password: success (Super Admin) updates THEIR OWN account only", r.status === 200 && w.updated.length === 1 && w.updated[0].id === ACTOR && w.updated[0].attrs.password === "brand-new-pass-1");
    check("change-password: other sessions are revoked, the current one kept", called(w, "app_after_password_change")[0].args.p_keep_session === "sess-123");
    check("change-password: verifies the current password against the caller's own address", w.signIns[0].email === "a@users.yokohama.invalid" && w.signIns[0].password === "old-password-1"); }
  { const { w, deps } = world({ me: SA_ME });
    await handleChangePassword(req({ current_password: "old-password-1", new_password: "brand-new-pass-1", user_id: TARGET, target_id: TARGET }), deps);
    check("change-password: a user id in the body is ignored (cannot change someone else's)", w.updated.every((u) => u.id === ACTOR)); }

  // ---------- admin: create ----------
  const good = { action: "create_user", username: "new.operator", password: "Temp-pass-2026", role: "operator", modules: ["inward", "stock"] };
  { const { w, deps } = world();
    const r = await handleAdminUsers(req(good), deps);
    check("create: operator created", r.status === 200 && w.created.length === 1);
    check("create: auth account uses id-based address and confirmed email", w.created[0].email === syntheticEmail(w.created[0].id) && w.created[0].email_confirm === true);
    const reg = called(w, "app_register_profile")[0].args;
    check("create: profile registered with chosen modules, created_by = the authorised actor", reg.p_role === "operator" && eq(reg.p_modules, ["inward", "stock"]) && reg.p_created_by === ACTOR);
    check("create: authorised through the database as the caller first", called(w, "app_authorize_manage")[0].args.p_role === "operator"); }
  { const { w, deps } = world({ authorize: null });
    const r = await handleAdminUsers(req(good), deps);
    check("create: refused by the database -> 403 and NOTHING is created", r.status === 403 && w.created.length === 0); }
  { const { w, deps } = world();
    const r = await handleAdminUsers(req({ ...good, role: "super_admin" }), deps);
    check("create: super_admin role -> 400, never reaches Auth", r.status === 400 && w.created.length === 0 && called(w, "app_authorize_manage").length === 0); }
  { const { w, deps } = world({ authorize: null });
    const r = await handleAdminUsers(req({ ...good, role: "admin" }), deps);
    check("create: admin creating an admin is refused by the database check", r.status === 403 && w.created.length === 0); }
  { const { w, deps } = world();
    check("create: weak password -> 400 before any call", (await handleAdminUsers(req({ ...good, password: "short" }), deps)).status === 400 && w.calls.length === 0 && w.created.length === 0);
    check("create: bad username -> 400", (await handleAdminUsers(req({ ...good, username: "a b" }), deps)).status === 400);
    check("create: unknown module -> 400", (await handleAdminUsers(req({ ...good, modules: ["inward", "bogus"] }), deps)).status === 400);
    check("create: no token -> 401", (await handleAdminUsers(req(good, null), deps)).status === 401); }
  { const { w, deps } = world({ registerError: 'duplicate key value violates unique constraint "app_profiles_username_key"' });
    const r = await handleAdminUsers(req(good), deps);
    check("create: duplicate username -> 409 and the Auth account is removed again (no half-made user)", r.status === 409 && w.deleted.length === 1 && w.deleted[0] === w.created[0].id); }
  { const { w, deps } = world({ createUserError: "boom" });
    const r = await handleAdminUsers(req(good), deps);
    check("create: Auth failure -> 400, no profile registered", r.status === 400 && called(w, "app_register_profile").length === 0); }
  { const { w, deps } = world({ createUserId: "99999999-9999-4999-8999-999999999999" });
    await handleAdminUsers(req(good), deps);
    check("create: if Auth picks its own id, the login address is fixed to match it", w.updated.some((u) => u.id === "99999999-9999-4999-8999-999999999999" && u.attrs.email === syntheticEmail("99999999-9999-4999-8999-999999999999"))
      && called(w, "app_register_profile")[0].args.p_id === "99999999-9999-4999-8999-999999999999"); }
  { const { w, deps } = world();
    await handleAdminUsers(req({ ...good, role: "admin", modules: ["inward"] }), deps);
    check("create: modules are not stored for admins", eq(called(w, "app_register_profile")[0]?.args.p_modules, []) || called(w, "app_register_profile").length === 0); }

  // ---------- admin: reset password ----------
  { const { w, deps } = world();
    const r = await handleAdminUsers(req({ action: "reset_password", target_id: TARGET, new_password: "Temp-reset-2026" }), deps);
    check("reset: success updates the target and signs them out", r.status === 200 && w.updated[0].id === TARGET && w.updated[0].attrs.password === "Temp-reset-2026" && called(w, "app_after_password_reset")[0].args.p_target === TARGET);
    check("reset: the actor passed on is the DATABASE-authorised actor, not a body value", called(w, "app_after_password_reset")[0].args.p_actor === ACTOR); }
  { const { w, deps } = world({ authorize: null });
    const r = await handleAdminUsers(req({ action: "reset_password", target_id: TARGET, new_password: "Temp-reset-2026" }), deps);
    check("reset: admin resetting another admin / super admin -> 403, nothing changed", r.status === 403 && w.updated.length === 0); }
  { const { w, deps } = world();
    check("reset: weak password -> 400, nothing changed", (await handleAdminUsers(req({ action: "reset_password", target_id: TARGET, new_password: "short" }), deps)).status === 400 && w.updated.length === 0);
    check("reset: password may not contain the target's username", (await handleAdminUsers(req({ action: "reset_password", target_id: TARGET, new_password: "xxop1xxxxxxxx" }), deps)).status === 400);
    check("reset: bad target id -> 400", (await handleAdminUsers(req({ action: "reset_password", target_id: "nope", new_password: "Temp-reset-2026" }), deps)).status === 400); }

  // ---------- admin: delete ----------
  { const { w, deps } = world();
    const r = await handleAdminUsers(req({ action: "delete_user", target_id: TARGET }), deps);
    check("delete: removes the Auth account then the profile", r.status === 200 && w.deleted[0] === TARGET && called(w, "app_finalize_delete")[0].args.p_target === TARGET); }
  { const { w, deps } = world({ authorize: null });
    const r = await handleAdminUsers(req({ action: "delete_user", target_id: TARGET }), deps);
    check("delete: refused -> 403, nothing deleted", r.status === 403 && w.deleted.length === 0); }
  { const { w, deps } = world({ deleteError: "User not found" });
    const r = await handleAdminUsers(req({ action: "delete_user", target_id: TARGET }), deps);
    check("delete: an already-missing Auth account does not block removing the profile", r.status === 200 && called(w, "app_finalize_delete").length === 1); }
  { const { w, deps } = world({ deleteError: "database exploded" });
    const r = await handleAdminUsers(req({ action: "delete_user", target_id: TARGET }), deps);
    check("delete: other Auth failure -> 500 and the profile is kept", r.status === 500 && called(w, "app_finalize_delete").length === 0); }
  { const { deps } = world();
    check("admin: unknown action -> 400", (await handleAdminUsers(req({ action: "make_me_super_admin" }), deps)).status === 400);
    check("admin: array body -> 400", (await handleAdminUsers(req([1]), deps)).status === 400); }
  { const { deps } = world({ tokenUser: null });
    check("admin: invalid token -> 401", (await handleAdminUsers(req(good), deps)).status === 401); }

  console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
