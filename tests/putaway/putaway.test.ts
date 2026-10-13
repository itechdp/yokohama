/* eslint-disable */
// Run with: npm run test:putaway
// The database functions are MODELLED by fake-supabase.ts; these tests check the
// app's behaviour against that model. The SQL itself is tested by tests/sql.
import { db, rpcFailAt, rpcCalls, failures, hooks, reset, snapshot } from "./fake-supabase";
import { insertPending, fetchPendingPutaways, cancelPending, makeSubmissionTracker, findPossibleDuplicates } from "@/lib/inward-pending";
import { putAwayPallet, PUTAWAY_RECEIPT_PREFIX } from "@/lib/inward-putaway";
import { fetchInwardReceipts } from "@/lib/inward-receipts";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const U = "user-1";
const newPallet = (id: string, over: any = {}) => ({ id, material: "M1", description: "Tire M1", quantity: 4, palletNo: "P-" + id, planNo: "SHEET-9", shift: "2", entryDate: "2026-10-13", pickerName: "Ravi", createdBy: "cage1", ...over });
const seed = async () => {
  reset();
  db.users.push({ id: U, username: "forklift1", role: "operator" });
  db.warehouses.push(
    { key: "wh1", label: "WH-1", prefix: "A", column_row_counts: [3, 3] },
    { key: "wh2", label: "WH-2", prefix: "B", column_row_counts: [3] },
  );
  await insertPending([newPallet("a"), newPallet("b", { material: "M2", description: "Tire M2", quantity: 2 })]);
};
const stock = () => db.tires.filter((t) => t.current_stage === "warehouse");
const status = (id: string) => db.inward_pending.find((r) => r.id === id)?.status;

(async () => {
  // ---------------- cage entry
  await seed();
  ok(db.inward_pending.length === 2 && status("a") === "pending", "cage entry: saved as pending");
  ok(db.inward_pending[0].entry_date === "2026-10-13" && (await fetchPendingPutaways()).pallets[0].entryDate === "2026-10-13", "cage entry: the Date is saved with the pallet and read back");
  ok(db.tires.length === 0 && db.inward_receipts.length === 0 && db.tire_history.length === 0, "cage entry: no stock, receipt or history written");
  await insertPending([newPallet("a"), newPallet("b", { material: "M2" })]);
  ok(db.inward_pending.length === 2, "the same submission sent again is ignored - still 2 pallets");
  let n = 0; const tr = makeSubmissionTracker(() => "id" + ++n);
  ok(tr.idFor("sigA") === tr.idFor("sigA") && tr.idFor("sigA") !== tr.idFor("sigB"), "tracker: same entry reuses its id, a different entry gets a new one");
  const idX = tr.idFor("sigX"); tr.done(); ok(tr.idFor("sigX") !== idX, "tracker: after a successful save the same entry counts as new");
  let list = await fetchPendingPutaways();
  ok(!list.error && list.pallets.length === 2, "pending list loads");
  failures.add("inward_pending.select"); list = await fetchPendingPutaways();
  ok(!!list.error && list.pallets.length === 0, "a failed read reports an error (not a silent empty list)");
  failures.clear();

  // ---------------- soft duplicate warning
  let d = await findPossibleDuplicates("SHEET-9", [{ palletNo: "P-a", material: "M1" }], "pp-other-");
  ok(!d.error && d.duplicates.length === 1 && d.duplicates[0].status === "pending", "duplicate check: same sheet + pallet + SKU already pending is flagged");
  d = await findPossibleDuplicates("SHEET-9", [{ palletNo: "P-a", material: "M2" }], "pp-other-"); ok(d.duplicates.length === 0, "duplicate check: different SKU is not flagged");
  d = await findPossibleDuplicates("SHEET-10", [{ palletNo: "P-a", material: "M1" }], "pp-other-"); ok(d.duplicates.length === 0, "duplicate check: another sheet is not flagged");
  d = await findPossibleDuplicates("SHEET-9", [{ palletNo: "P-a", material: "M1" }], "a"); ok(d.duplicates.length === 0, "duplicate check: ignores the submission's own rows");
  failures.add("inward_pending.select"); d = await findPossibleDuplicates("SHEET-9", [{ palletNo: "P-a", material: "M1" }], "x"); ok(!!d.error, "duplicate check: a failed lookup reports an error");
  failures.clear();
  await insertPending([newPallet("a2")]); ok(db.inward_pending.length === 3, "a genuine repeat can still be saved (nothing blocks it)");
  db.inward_pending = db.inward_pending.filter((r) => r.id !== "a2");

  // ---------------- success path
  let r = await putAwayPallet("a", "wh1", "A01-02", U);
  ok(!r.error && !r.alreadyDone && r.location === "WH-1 - Bin A01-02", "putaway succeeds");
  ok(stock().length === 4 && stock().every((t) => t.location === "WH-1 - Bin A01-02" && t.serial_number === "M1"), "4 tires in stock at the chosen bin");
  ok(db.tire_history.length === 4 && db.placement_logs.length === 4, "history + placement log row per tire");
  const rc = (await fetchInwardReceipts())[0];
  ok(db.inward_receipts.length === 1 && rc.palletNo === "P-a" && rc.material === "M1" && rc.quantity === 4 && rc.warehouse === "WH-1" && rc.location === "WH-1 - Bin A01-02", "receipt: correct pallet/SKU/qty/warehouse/location");
  ok(rc.planNo === "SHEET-9" && rc.shift === "2" && rc.pickerName === "Ravi" && rc.receivedBy === "forklift1", "receipt: sheet/shift/driver from the cage record, user from the users table");
  ok(status("a") === "put_away" && db.inward_pending[0].putaway_by === "forklift1", "pallet marked put_away with who/where");
  ok((await fetchPendingPutaways()).pallets.every((p) => p.id !== "a"), "a put-away pallet leaves the pending list");

  // ---------------- how History recognises a putaway (its "Putaway" tab)
  // real pallet ids start with "pp-" (the cage handler builds them that way); a normal Inward receipt id never does
  await insertPending([newPallet("pp-hist-1", { palletNo: "P-h" })]);
  await putAwayPallet("pp-hist-1", "wh1", "A01-01", U);
  const putawayReceipt = db.inward_receipts.find((x) => x.pallet_no === "P-h");
  ok(!!putawayReceipt && putawayReceipt.id.startsWith(PUTAWAY_RECEIPT_PREFIX), "a putaway's receipt id starts with the prefix History uses for its Putaway tab");
  ok(!"ir-1760000000000-0-abcde".startsWith(PUTAWAY_RECEIPT_PREFIX), "a normal Inward receipt id does not");

  // ---------------- repeated / simultaneous / lost response
  const before = snapshot(); r = await putAwayPallet("a", "wh2", "B01-01", U);
  ok(!r.error && r.alreadyDone && r.location === "WH-1 - Bin A01-02" && snapshot() === before, "repeat call: 'already done' with the original location, nothing changed");
  await seed();
  const both = await Promise.all([putAwayPallet("a", "wh1", "A01-01", U), putAwayPallet("a", "wh2", "B01-01", U), putAwayPallet("a", "wh1", "A02-01", U)]);
  ok(both.every((x) => !x.error) && both.filter((x) => !x.alreadyDone).length === 1, "3 simultaneous requests: exactly one performs the putaway");
  ok(stock().length === 4 && db.inward_receipts.length === 1 && db.tire_history.length === 4, "...stock is 4 (not 8/12), one receipt");
  await seed(); hooks.dropResponseOnce = true; r = await putAwayPallet("a", "wh1", "A01-01", U);
  ok(!!r.error && stock().length === 4 && status("a") === "put_away", "response lost after commit: an error is shown but stock is saved once");
  r = await putAwayPallet("a", "wh1", "A01-01", U);
  ok(!r.error && r.alreadyDone && stock().length === 4 && db.inward_receipts.length === 1, "...retrying is safe: 'already done', still 4 tires, one receipt");

  // ---------------- failure at EVERY step -> full rollback, then clean retry
  for (const stepName of ["lock", "user", "tires", "history", "logs", "receipt", "plan", "mark"]) {
    await seed();
    db.tires.push({ id: "prod1", serial_number: "M1", current_stage: "production", location: "Plant" });
    const snap = snapshot(); rpcFailAt.add(stepName);
    r = await putAwayPallet("a", "wh1", "A01-01", U);
    ok(!!r.error && snapshot() === snap, `failure at '${stepName}': error shown, database exactly as before`);
    rpcFailAt.clear(); r = await putAwayPallet("a", "wh1", "A01-01", U);
    ok(!r.error && !r.alreadyDone && stock().length === 4 && db.inward_receipts.length === 1 && status("a") === "put_away", `after '${stepName}' failure: retry succeeds, 4 tires, 1 receipt`);
  }

  // ---------------- validation
  await seed(); const clean = snapshot();
  for (const [wh, bin, why] of [["wh1", "B01-01", "bin from another warehouse"], ["wh1", "A09-01", "row outside layout"], ["wh1", "A01-09", "position outside layout"],
    ["wh1", "A1-1", "non-canonical code"], ["wh1", "", "empty bin"], ["nope", "A01-01", "unknown warehouse"], ["wh1", "A01-01-X3", "old stand suffix"]] as const) {
    r = await putAwayPallet("a", wh, bin, U); ok(!!r.error && snapshot() === clean, `rejected, nothing changed: ${why}`);
  }
  r = await putAwayPallet("a", "wh1", "A01-01", "someone-else"); ok(!!r.error && snapshot() === clean, "unknown user rejected, nothing changed");
  const calls = rpcCalls.length; r = await putAwayPallet("a", "wh1", "A01-01", undefined);
  ok(!!r.error && rpcCalls.length === calls && snapshot() === clean, "not logged in: refused before calling the server");
  r = await putAwayPallet("zzz", "wh1", "A01-01", U); ok(!!r.error && snapshot() === clean, "unknown pallet rejected");

  // ---------------- cancel
  await seed();
  let c = await cancelPending("a", U);
  ok(!c.error && status("a") === "cancelled" && db.tires.length === 0 && (await fetchPendingPutaways()).pallets.every((p) => p.id !== "a"), "cancel: leaves the pending list, no stock touched");
  c = await cancelPending("a", U); ok(!c.error, "cancel twice is harmless");
  r = await putAwayPallet("a", "wh1", "A01-01", U); ok(!!r.error && db.tires.length === 0, "a cancelled pallet can't be put away");
  await putAwayPallet("b", "wh1", "A01-01", U); const afterPut = snapshot();
  c = await cancelPending("b", U); ok(!!c.error && snapshot() === afterPut, "a put-away pallet can't be cancelled");
  c = await cancelPending("a", undefined); ok(!!c.error, "cancel needs a logged-in user");

  // ---------------- production reuse, other stock untouched
  await seed();
  db.tires.push(...[1, 2].map((i) => ({ id: "prod" + i, serial_number: "M1", current_stage: "production", location: "Plant" })),
    { id: "other", serial_number: "X", current_stage: "warehouse", location: "WH-2 - Bin B01-01" }, { id: "disp", serial_number: "M1", current_stage: "dispatch", location: "Picking" });
  r = await putAwayPallet("a", "wh1", "A01-01", U);
  ok(!r.error && stock().filter((t) => t.location === "WH-1 - Bin A01-01").length === 4 && db.tires.filter((t) => t.id.startsWith("prod")).every((t) => t.current_stage === "warehouse"), "production-stage units reused first, the rest created (4 total)");
  ok(db.tires.length === 6 && db.tires.find((t) => t.id === "other")!.location === "WH-2 - Bin B01-01" && db.tires.find((t) => t.id === "disp")!.current_stage === "dispatch", "other stock and dispatch tires untouched");

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
