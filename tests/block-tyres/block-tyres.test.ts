/* eslint-disable */
// Run with: npm run test:block-tyres
import ExcelJS from "exceljs";
import { reset, state } from "./fake-supabase";
import { addPlanBlockTire, fetchPlanBlockTires, parseBlockQty, istDateKey, isBlocked, unblockPlanBlockTire, unblockPlanBlockTires } from "@/lib/plan-block-tires";
import { buildBlockTyresWorkbook } from "@/lib/block-tyres-excel-export";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const entry = (over: Partial<Parameters<typeof addPlanBlockTire>[0]> = {}) => ({ planNo: "PLAN-1", material: "100259-36", description: "10-16.5 GX BB", qty: 5, createdBy: "op1", ...over });

async function main() {
  console.log("== quantity entry");
  ok(parseBlockQty("5") === 5, "5 is accepted");
  ok(parseBlockQty(" 12 ") === 12, "surrounding spaces are ignored");
  ok(parseBlockQty("0") === null && parseBlockQty("") === null && parseBlockQty("-3") === null && parseBlockQty("2.5") === null && parseBlockQty("abc") === null, "0, blank, negative, decimal and text are refused");
  ok(parseBlockQty("99999") === 99999 && parseBlockQty("100000") === null, "the upper limit is 99999");

  console.log("== plan selection -> save");
  reset();
  const saved = await addPlanBlockTire(entry());
  ok(saved.ok === true && saved.row.qty === 5 && saved.row.planNo === "PLAN-1" && saved.row.material === "100259-36", "a tyre + qty is saved against the plan");
  ok(saved.ok && saved.row.createdBy === "op1" && !!saved.row.createdAt, "who saved it and when are recorded");
  ok(state.rows.length === 1, "exactly one row was written");

  console.log("== duplicate prevention");
  const dup = await addPlanBlockTire(entry({ qty: 9 }));
  ok(dup.ok === false && dup.duplicate === true, "the same tyre under the same plan is refused");
  ok(dup.ok === false && dup.duplicate && dup.existing?.qty === 5 && dup.error.includes("qty 5"), "...and the message shows the existing quantity (5)");
  ok(state.rows.length === 1 && state.rows[0].qty === 5, "...and the saved record is unchanged");
  const dup2 = await addPlanBlockTire(entry({ planNo: " plan-1 ", material: "100259-36 ", qty: 2 }));
  ok(dup2.ok === false && dup2.duplicate === true, "case / stray spaces don't get around the duplicate rule");
  const other = await addPlanBlockTire(entry({ material: "100260-36", qty: 3 }));
  const otherPlan = await addPlanBlockTire(entry({ planNo: "PLAN-2", qty: 4 }));
  ok(other.ok && otherPlan.ok && state.rows.length === 3, "a different tyre, or the same tyre under another plan, is allowed");

  console.log("== validation");
  const before = state.rows.length;
  for (const bad of [0, -1, 2.5, 100000, NaN]) {
    const r = await addPlanBlockTire(entry({ planNo: "PLAN-9", qty: bad as number }));
    ok(r.ok === false && r.duplicate === false, `quantity ${bad} is refused`);
  }
  ok((await addPlanBlockTire(entry({ planNo: "  " }))).ok === false, "a blank plan is refused");
  ok((await addPlanBlockTire(entry({ material: "" }))).ok === false, "a blank tyre is refused");
  ok(state.rows.length === before, "nothing was written by the refused attempts");

  console.log("== read back / per plan");
  const p1 = await fetchPlanBlockTires({ planNo: "PLAN-1" });
  ok(p1.error === null && p1.rows.length === 2, "a plan's page lists only its own records");
  ok(p1.rows.reduce((s, r) => s + r.qty, 0) === 8, "...with the right total (5 + 3)");
  state.failSelect = "boom";
  const failed = await fetchPlanBlockTires();
  ok(failed.error === "boom" && failed.rows.length === 0, "a failed read is reported as an error, not as 'no records'");
  state.failSelect = null;

  console.log("== history: date filter (India time) and paging");
  reset();
  const stamps = ["2026-10-10T18:29:00Z", "2026-10-10T18:31:00Z", "2026-10-11T05:00:00Z", "2026-10-12T20:00:00Z"]; // IST: 10 Oct 23:59, 11 Oct 00:01, 11 Oct 10:30, 13 Oct 01:30
  for (let i = 0; i < stamps.length; i++) {
    state.now = () => stamps[i];
    await addPlanBlockTire(entry({ planNo: `P${i}`, material: `M${i}`, qty: i + 1 }));
  }
  ok(istDateKey(stamps[0]) === "2026-10-10" && istDateKey(stamps[1]) === "2026-10-11", "dates are taken in India time (a record just after midnight IST belongs to the next day)");
  const day = await fetchPlanBlockTires({ from: "2026-10-11", to: "2026-10-11" });
  ok(day.rows.map((r) => r.material).join() === "M2,M1", "the 11 Oct filter returns the two records saved that IST day, newest first");
  const range = await fetchPlanBlockTires({ from: "2026-10-10", to: "2026-10-13" });
  ok(range.rows.length === 4 && range.rows[0].material === "M3", "a wider range returns everything, newest first");
  const none = await fetchPlanBlockTires({ from: "2026-11-01", to: "2026-11-02" });
  ok(none.rows.length === 0 && none.error === null, "a range with nothing returns an empty list");
  reset();
  for (let i = 0; i < 2350; i++) state.rows.push({ id: i + 1, plan_no: "P", material: "M" + i, description: "", qty: 1, created_by: "", created_at: new Date(1760000000000 + i * 1000).toISOString() });
  const all = await fetchPlanBlockTires();
  ok(all.rows.length === 2350 && new Set(all.rows.map((r) => r.id)).size === 2350, "2350 records are all returned (not cut off at 1000)");

  console.log("== Excel export");
  reset();
  state.now = () => "2026-10-11T05:00:00Z";
  await addPlanBlockTire(entry({ planNo: "PLAN-A", material: "100259-36", description: "Tyre A", qty: 5, createdBy: "rahul" }));
  state.now = () => "2026-10-12T05:00:00Z";
  await addPlanBlockTire(entry({ planNo: "PLAN-B", material: "100260-36", description: "Tyre B", qty: 7, createdBy: "amit" }));
  const { rows } = await fetchPlanBlockTires();
  const wb = buildBlockTyresWorkbook(rows, { dateFrom: "2026-10-11", dateTo: "2026-10-12" });
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf as ArrayBuffer);
  const ws = back.getWorksheet("Block Tyres")!;
  const cell = (r: number, c: number) => String(ws.getCell(r, c).value ?? "");
  ok(!!ws && cell(1, 1) === "BLOCK TYRES" && cell(2, 1).includes("2026-10-11 to 2026-10-12"), "the workbook has the title and the date range");
  ok([1, 2, 3, 4, 5, 6, 7].map((c) => cell(3, c)).join("|") === "S No|Date (IST)|Plan No|SKU Code|Description|Qty|Operator", "headers: S No, Date, Plan No, SKU Code, Description, Qty, Operator");
  ok(cell(4, 3) === "PLAN-B" && cell(4, 4) === "100260-36" && cell(4, 6) === "7" && cell(4, 7) === "amit" && cell(4, 2).includes("2026"), "newest record first, with plan / SKU / qty / operator / date");
  ok(cell(5, 3) === "PLAN-A" && cell(5, 5) === "Tyre A" && cell(5, 6) === "5", "...then the older record with its description");
  ok(cell(6, 1) === "TOTAL BLOCKED (currently)" && cell(6, 6) === "12", "a total row sums the quantities that are currently blocked (5 + 7)");
  ok(cell(3, 8) === "Status" && cell(4, 8) === "Blocked" && cell(5, 8) === "Blocked", "a Status column says Blocked");
  const empty = buildBlockTyresWorkbook([], {});
  ok(String(empty.getWorksheet("Block Tyres")!.getCell(4, 1).value).startsWith("TOTAL"), "an empty export still produces a valid sheet");

  console.log("== unblock (status change, never a deletion)");
  reset();
  state.now = () => "2026-10-19T10:00:00Z";
  const a = await addPlanBlockTire(entry({ planNo: "PLAN-U", material: "M-A", qty: 5 }));
  const b = await addPlanBlockTire(entry({ planNo: "PLAN-U", material: "M-B", qty: 3 }));
  const c = await addPlanBlockTire(entry({ planNo: "PLAN-V", material: "M-A", qty: 4 }));
  ok(a.ok && b.ok && c.ok, "three blocked records");
  state.now = () => "2026-10-20T10:00:00Z";
  const u1 = await unblockPlanBlockTire((a as any).row.id, "rahul");
  ok(u1.error === null, "unblocking one SKU succeeds");
  const planRows = (await fetchPlanBlockTires({ planNo: "PLAN-U" })).rows;
  const ua = planRows.find((r) => r.material === "M-A")!;
  ok(planRows.length === 2 && !isBlocked(ua) && ua.unblockedBy === "rahul" && !!ua.unblockedAt, "the record is KEPT, marked unblocked, with who and when");
  ok(ua.qty === 5 && ua.planNo === "PLAN-U" && ua.createdBy === "op1", "...its plan, tyre, quantity and operator are unchanged");
  ok(planRows.filter(isBlocked).reduce((s, r) => s + r.qty, 0) === 3, "...and the plan's blocked total drops from 8 to 3");
  ok((await unblockPlanBlockTire((a as any).row.id, "someone-else")).error === null && state.rows.find((r) => r.id === (a as any).row.id)!.unblocked_by === "rahul", "unblocking again is harmless and keeps the first person's name");
  ok((await unblockPlanBlockTire(99999, "x")).error === "record not found", "an unknown record is an error");
  const reblock = await addPlanBlockTire(entry({ planNo: "PLAN-U", material: "M-A", qty: 9 }));
  ok(reblock.ok === true && state.rows.filter((r) => r.plan_no === "PLAN-U" && r.material === "M-A").length === 2, "an unblocked tyre can be blocked again (a new record; the old one stays)");
  const stillDup = await addPlanBlockTire(entry({ planNo: "PLAN-U", material: "M-B", qty: 1 }));
  ok(stillDup.ok === false && stillDup.duplicate === true, "a tyre that is still blocked is still refused as a duplicate");
  ok(stillDup.ok === false && stillDup.duplicate && stillDup.existing?.qty === 3, "...showing the quantity that is blocked (3)");
  const ua2 = await unblockPlanBlockTires(" plan-u ", "amit");
  ok(ua2.error === null && ua2.count === 2, "Unblock all unblocks every blocked record of the plan (M-B and the re-block)");
  ok(state.rows.filter((r) => r.plan_no === "PLAN-U" && !r.unblocked_at).length === 0, "...none of that plan is blocked any more");
  ok(state.rows.find((r) => r.plan_no === "PLAN-V")!.unblocked_at === null, "...and another plan is untouched");
  ok(state.rows.filter((r) => r.plan_no === "PLAN-U").reduce((s, r) => s + r.qty, 0) === 17 && state.rows.length === 4, "...no quantity changed and no record was deleted (5 + 3 + 9, 4 rows)");
  ok((await unblockPlanBlockTires("PLAN-V", "x")).count === 1 && (await unblockPlanBlockTires("PLAN-V", "x")).count === 0, "Unblock all on an already-unblocked plan unblocks 0");
  ok((await unblockPlanBlockTires("  ", "x")).error === "plan number is required", "a blank plan is refused");
  state.failRpc = "function not found";
  ok((await unblockPlanBlockTire(1, "x")).error === "function not found", "a failing database call is reported, not hidden");
  state.failRpc = null;
  const rejected = (await import("./fake-supabase")).supabase.from("plan_block_tires").insert({ plan_no: "Q", material: "Q", qty: 1, unblocked_at: "2026-10-20T00:00:00Z" });
  ok((await (rejected as any).select().single()).error !== null, "a record can't be created already unblocked");

  console.log("== history + Excel after unblocking");
  const hist = (await fetchPlanBlockTires()).rows;
  const wb2 = buildBlockTyresWorkbook(hist, {});
  const back2 = new ExcelJS.Workbook();
  await back2.xlsx.load((await wb2.xlsx.writeBuffer()) as ArrayBuffer);
  const ws2 = back2.getWorksheet("Block Tyres")!;
  const c2 = (r: number, col: number) => String(ws2.getCell(r, col).value ?? "");
  const statuses = [4, 5, 6, 7].map((r) => c2(r, 8));
  ok(statuses.every((s) => s === "Unblocked") && c2(3, 9) === "Unblocked At (IST)" && c2(3, 10) === "Unblocked By", "every record is marked Unblocked in the sheet, with the unblocked columns");
  ok([4, 5, 6, 7].some((r) => c2(r, 10) === "rahul") && [4, 5, 6, 7].some((r) => c2(r, 10) === "amit"), "...naming who unblocked each");
  ok(c2(8, 1) === "TOTAL BLOCKED (currently)" && c2(8, 6) === "0", "...and the currently-blocked total is 0");

  console.log(fails === 0 ? "\nALL PASSED" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
