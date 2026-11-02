// What scripts/replace-users.mjs would change (pure rules, no database).
import { planReplacement, type Profile } from "../../scripts/replace-plan";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log("PASS " + name);
  else { failed++; console.log("FAIL " + name + (detail ? "  -> " + detail : "")); }
}

const P = (id: string, username: string, role: string, is_active = true): Profile => ({ id, username, role, is_active });
const base = [P("1", "mehul", "super_admin"), P("2", "admin", "admin"), P("3", "op1", "operator"), P("4", "op2", "operator", false)];

const r = planReplacement(base, "Meck", "RamLaxman");
check("valid state gives a plan", Boolean(r.plan) && !r.error);
check("plan renames the Super Admin", r.plan?.rename === true && r.plan.renameFrom === "mehul" && r.plan.renameTo === "Meck");
check("Super Admin keeps its id", r.plan?.superId === "1");
check("every other account is listed for removal (incl. inactive)", r.plan?.remove.map((x) => x.id).join() === "2,3,4");
check("Super Admin is never in the removal list", !r.plan?.remove.some((x) => x.id === "1"));
check("Admin does not exist yet", r.plan?.adminId === null);

// Re-run: the end state again.
const done = [P("1", "Meck", "super_admin"), P("9", "RamLaxman", "admin")];
const again = planReplacement(done, "Meck", "RamLaxman");
check("re-run on the end state: nothing to remove or rename", again.plan?.remove.length === 0 && again.plan?.rename === false && again.plan?.adminId === "9");
check("Admin to keep is never removed", !planReplacement([...base, P("9", "ramlaxman", "admin")], "Meck", "RamLaxman").plan?.remove.some((x) => x.id === "9"));
check("existing Admin is matched case-insensitively", planReplacement([...base, P("9", "ramlaxman", "admin")], "Meck", "RamLaxman").plan?.adminId === "9");

// Refusals
check("no Super Admin -> refused", Boolean(planReplacement([P("2", "admin", "admin")], "Meck", "RamLaxman").error));
check("two Super Admins -> refused", Boolean(planReplacement([P("1", "a", "super_admin"), P("2", "b", "super_admin")], "Meck", "RamLaxman").error));
check("inactive Super Admin -> refused", Boolean(planReplacement([P("1", "mehul", "super_admin", false)], "Meck", "RamLaxman").error));
check("new Super Admin name used by another account -> refused", Boolean(planReplacement([...base, P("7", "MECK", "operator")], "Meck", "RamLaxman").error));
check("Admin name already an Operator -> refused", Boolean(planReplacement([...base, P("7", "RamLaxman", "operator")], "Meck", "RamLaxman").error));
check("Admin name is the Super Admin's own name -> refused", Boolean(planReplacement(base, "Meck", "mehul").error));
check("inactive existing Admin -> refused", Boolean(planReplacement([...base, P("7", "RamLaxman", "admin", false)], "Meck", "RamLaxman").error));
check("same name for both -> refused", Boolean(planReplacement(base, "Meck", "meck").error));
check("unreadable profiles -> refused", Boolean(planReplacement(null, "Meck", "RamLaxman").error));
check("input is not modified", base.length === 4 && base[0].username === "mehul");

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nAll replace-plan tests passed");
