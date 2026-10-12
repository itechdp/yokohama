/* eslint-disable */
// Run with: npm run test:delete-safety
import { db, hooks } from "./fake-supabase";
import { deleteTiresInWarehouse, deleteTiresAtLocation } from "@/lib/tires";
const W = (key: string, label: string) => ({ key, label, prefix: key[0].toUpperCase(), column_row_counts: [2] });
let n = 0; const fails: string[] = [];
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
function seed(extraWh: any[] = []) {
  db.warehouses = [W("wh1", "WH-1"), W("wh2", "WH-2"), W("dom", "Domestic"), W("rms", "RMS"), ...extraWh];
  db.tires = [];
  const add = (stage: string, loc: string, mat: string, k = 3) => { for (let i = 0; i < k; i++) db.tires.push({ id: `t${n++}`, serial_number: mat, current_stage: stage, location: loc }); };
  add("warehouse", "WH-1 - Bin A01-01", "M1"); add("warehouse", "WH-1 - Bin A01-01", "M2"); add("warehouse", "WH-1 - Bin A01-02", "M1");
  add("warehouse", "WH-2 - Bin B01-01", "M1"); add("warehouse", "Domestic - Bin D01-01", "M1"); add("warehouse", "RMS - Bin R01-01", "M1");
  add("production", "", "M1"); add("dispatch", "WH-1 - Bin A01-01", "M1"); add("dispatch", "", "M1");
}
const count = (f: (r: any) => boolean) => db.tires.filter(f).length;
const inWh = (l: string) => (r: any) => r.current_stage === "warehouse" && r.location.startsWith(l + " - Bin ");
(async () => {
  for (const [key, label] of [["wh1","WH-1"],["wh2","WH-2"],["dom","Domestic"],["rms","RMS"]]) {
    seed(); const before = db.tires.length; const others = db.tires.filter((r) => !inWh(label)(r)).length;
    const r = await deleteTiresInWarehouse({ key, label });
    ok(!r.error && r.deletedCount === before - others, `${label}: deleted only its own (${r.deletedCount})`);
    ok(count(inWh(label)) === 0, `${label}: its stock gone`);
    ok(db.tires.length === others, `${label}: every other tire untouched (${others})`);
    ok(count((x) => x.current_stage !== "warehouse") === 9, `${label}: production/dispatch intact`);
  }
  seed(); let r = await deleteTiresInWarehouse({ key: "zzz", label: "WH-9" });
  ok(!!r.error && db.tires.length === 27, "unknown warehouse refused, nothing deleted: " + r.error);
  seed(); const len = db.tires.length; r = await deleteTiresInWarehouse({ key: "wh1", label: "WH-2" });
  ok(!!r.error && db.tires.length === len, "key/label mismatch refused, nothing deleted");
  // longest-label ownership: "WH-1 - Bin X" would swallow WH-1's tires -> list rejected
  seed([W("tricky", "WH-1 - Bin X")]); const l2 = db.tires.length; r = await deleteTiresInWarehouse({ key: "wh1", label: "WH-1" });
  ok(!!r.error && db.tires.length === l2, "unsafe warehouse name in list refused: " + r.error);
  seed([W("dup", "RMS")]); const l3 = db.tires.length; r = await deleteTiresInWarehouse({ key: "rms", label: "RMS" });
  ok(!!r.error && db.tires.length === l3, "duplicate warehouse names refused");
  seed([W("sp", "WH-1 ")]); const l4 = db.tires.length; r = await deleteTiresInWarehouse({ key: "wh1", label: "WH-1" });
  ok(!!r.error && db.tires.length === l4, "padded name refused");
  // similar names: WH-1 vs WH-10
  seed([W("wh10", "WH-10")]); db.tires.push({ id: "x1", serial_number: "M1", current_stage: "warehouse", location: "WH-10 - Bin A01-01" });
  r = await deleteTiresInWarehouse({ key: "wh1", label: "WH-1" });
  ok(!r.error && db.tires.some((x) => x.id === "x1"), "WH-10 survives deleting WH-1");
  // Race: another device changes tires after the code read them, before it deletes.
  seed(); hooks.beforeDelete = () => {
    const a = db.tires.find((x) => x.location === "WH-1 - Bin A01-01" && x.current_stage === "warehouse")!;
    a.location = "WH-2 - Bin B01-01"; // moved to another warehouse, still in storage
    const b = db.tires.find((x) => x.location === "WH-1 - Bin A01-02" && x.current_stage === "warehouse")!;
    b.current_stage = "dispatch"; // picked meanwhile
    db.tires.push({ id: "late", serial_number: "M1", current_stage: "warehouse", location: "WH-1 - Bin A01-01" }); // arrived meanwhile
  };
  const moved = db.tires.find((x) => x.location === "WH-1 - Bin A01-01" && x.current_stage === "warehouse")!.id;
  const picked = db.tires.find((x) => x.location === "WH-1 - Bin A01-02" && x.current_stage === "warehouse")!.id;
  r = await deleteTiresInWarehouse({ key: "wh1", label: "WH-1" });
  ok(!r.error && db.tires.some((x) => x.id === moved), "race: tire moved to WH-2 mid-delete is NOT deleted");
  ok(db.tires.some((x) => x.id === picked), "race: tire picked (dispatch) mid-delete is NOT deleted");
  ok(db.tires.some((x) => x.id === "late"), "race: tire that arrived after the read is left alone");
  ok(count((x) => x.location === "WH-2 - Bin B01-01") === 4, "race: WH-2 stock intact (incl. moved tire)");
  seed(); hooks.beforeDelete = () => { db.tires.filter((x) => x.serial_number === "M1" && x.location === "WH-1 - Bin A01-01" && x.current_stage === "warehouse").forEach((x) => (x.location = "WH-2 - Bin B01-01")); };
  r = await deleteTiresAtLocation("M1", "WH-1 - Bin A01-01");
  ok(!r.error && r.deletedCount === 0 && count((x) => x.location === "WH-2 - Bin B01-01") === 6, "race: picking delete skips tires that moved away mid-delete");
  // Picking
  seed(); const b = db.tires.length;
  r = await deleteTiresAtLocation("M1", "WH-1 - Bin A01-01");
  ok(!r.error && r.deletedCount === 3 && db.tires.length === b - 3, "picking: only M1 @ WH-1 A01-01 (3)");
  ok(count((x) => x.serial_number === "M2" && x.location === "WH-1 - Bin A01-01") === 3, "picking: other model, same bin kept");
  ok(count((x) => x.serial_number === "M1" && x.location === "WH-1 - Bin A01-02") === 3, "picking: same model, other bin kept");
  ok(count((x) => x.current_stage === "dispatch" && x.location === "WH-1 - Bin A01-01") === 3, "picking: dispatch tires at same text kept");
  ok(count((x) => x.location === "WH-2 - Bin B01-01") === 3, "picking: other warehouses kept");
  seed(); const c = db.tires.length;
  r = await deleteTiresAtLocation("M1", "Nowhere - Bin A01-01"); ok(!!r.error && db.tires.length === c, "picking: unknown warehouse refused");
  r = await deleteTiresAtLocation("", "WH-1 - Bin A01-01"); ok(!!r.error && db.tires.length === c, "picking: empty material refused");
  r = await deleteTiresAtLocation("M1", "WH-1 - Bin "); ok(!!r.error || true, "picking: empty bin -> " + (r.error ?? `deleted ${r.deletedCount} (exact match, none)`));
  ok(db.tires.length === c, "picking: empty bin deleted nothing");
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED"); process.exit(fails.length ? 1 : 0);
})();
