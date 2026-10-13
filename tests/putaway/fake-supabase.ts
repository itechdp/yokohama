/* eslint-disable */
// In-memory stand-in for the supabase client, for tests that need no network and
// no real database.
//
// IMPORTANT LIMIT: the `rpc` handlers are a TypeScript MODEL of the SQL functions
// putaway_pallet / cancel_pending_pallet in supabase/migrations/inward_pending.sql
// (same steps, same order, all-or-nothing rollback, a lock). They test the app's
// handling of those functions. The SQL itself is exercised separately by
// tests/sql/run-local-pg-tests.sh (local PostgreSQL, not Supabase).
type Row = Record<string, any>;
export const db: Record<string, Row[]> = {};
export const failures = new Set<string>(); // generic client failures, "table.op"
export const rpcFailAt = new Set<string>(); // step names inside the modelled functions
export const rpcCalls: string[] = [];
export const hooks: { dropResponseOnce?: boolean } = {};
const locks = new Map<string, Promise<void>>();
const TABLES = ["tires", "warehouses", "users", "inward_pending", "inward_receipts", "tire_history", "placement_logs", "plan_numbers"];
export const reset = () => {
  for (const k of Object.keys(db)) delete db[k];
  for (const t of TABLES) db[t] = [];
  failures.clear(); rpcFailAt.clear(); rpcCalls.length = 0; hooks.dropResponseOnce = false; locks.clear();
};
reset();
export const snapshot = () => JSON.stringify(db);

class Q {
  filters: ((r: Row) => boolean)[] = [];
  op: "select" | "upsert" | "insert" = "select";
  payload: any; ignoreDup = false;
  constructor(private t: string) {}
  select(_c?: string) { return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: any, o?: any) { this.op = "upsert"; this.payload = p; this.ignoreDup = !!o?.ignoreDuplicates; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  order() { return this; }
  limit() { return this; }
  then(res: any, rej?: any) { return Promise.resolve(this.run()).then(res, rej); }
  private run() {
    if (failures.has(`${this.t}.${this.op}`)) return { data: null, error: { message: `injected ${this.t}.${this.op} failure` } };
    const rows = db[this.t] ?? (db[this.t] = []);
    if (this.op === "insert") { for (const p of [].concat(this.payload)) rows.push({ ...p }); return { data: null, error: null }; }
    if (this.op === "upsert") {
      for (const p of [].concat(this.payload) as Row[]) {
        const i = rows.findIndex((r) => r.id === p.id);
        if (i >= 0) { if (!this.ignoreDup) rows[i] = { ...rows[i], ...p }; } else rows.push({ ...p });
      }
      return { data: null, error: null };
    }
    return { data: rows.filter((r) => this.filters.every((f) => f(r))).map((r) => ({ ...r })), error: null };
  }
}

// ---- model of the SQL functions -------------------------------------------
const tick = () => Promise.resolve();
async function lockRow(id: string): Promise<() => void> {
  while (locks.has(id)) await locks.get(id);
  let release!: () => void;
  locks.set(id, new Promise<void>((r) => (release = r)));
  return () => { locks.delete(id); release(); };
}
const step = (name: string) => { if (rpcFailAt.has(name)) throw new Error(`injected failure at ${name}`); };

// One lock for every putaway (stricter than the real per-pallet row lock) so a
// whole-database snapshot is a valid rollback.
async function putawayPallet(a: { p_pallet_id: string; p_warehouse_key: string; p_bin: string; p_user_id: string }) {
  step("lock");
  const unlock = await lockRow("tx");
  const snap = snapshot();
  try {
    await tick();
    step("user");
    const user = db.users.find((u) => u.id === a.p_user_id);
    if (!user) throw new Error("putaway: not logged in (unknown user)");
    const pallet = db.inward_pending.find((p) => p.id === a.p_pallet_id);
    if (!pallet) throw new Error("putaway: pallet not found");
    if (pallet.status === "put_away") return { result: "already_put_away", warehouse: pallet.warehouse, location: pallet.location, quantity: pallet.quantity };
    if (pallet.status !== "pending") throw new Error(`putaway: pallet is ${pallet.status} and cannot be put away`);
    step("validate");
    const wh = db.warehouses.find((w) => w.key === a.p_warehouse_key);
    if (!wh) throw new Error("putaway: warehouse not found");
    const bin = a.p_bin ?? "";
    const rest = bin.startsWith(wh.prefix) ? bin.slice(wh.prefix.length) : "";
    if (!/^[0-9]{2,}-[0-9]{2,}$/.test(rest)) throw new Error(`putaway: bin ${bin} is not a valid bin code in ${wh.label}`);
    const [col, row] = rest.split("-").map(Number);
    const pad = (n: number) => String(n).padStart(2, "0");
    if (col < 1 || col > wh.column_row_counts.length || row < 1 || row > (wh.column_row_counts[col - 1] ?? 0) || bin !== `${wh.prefix}${pad(col)}-${pad(row)}`)
      throw new Error(`putaway: bin ${bin} does not exist in warehouse ${wh.label}`);
    const location = `${wh.label} - Bin ${bin}`;
    const now = new Date().toISOString();
    const note = `Inward (putaway): ${pallet.description} moved to ${location}`;
    await tick();
    step("tires");
    const reuse = db.tires.filter((t) => t.current_stage === "production" && t.serial_number === pallet.material).slice(0, pallet.quantity);
    reuse.forEach((t) => Object.assign(t, { current_stage: "warehouse", location, updated_at: now }));
    const ids: string[] = reuse.map((t) => t.id);
    for (let k = 1; k <= pallet.quantity - reuse.length; k++) {
      const id = `t-${pallet.id}-${k}`;
      if (db.tires.some((t) => t.id === id)) throw new Error("duplicate key (tires)");
      db.tires.push({ id, serial_number: pallet.material, model: pallet.description, current_stage: "warehouse", location, created_at: now });
      ids.push(id);
    }
    await tick();
    step("history");
    for (const id of ids) db.tire_history.push({ id: `h-${id}`, tire_id: id, stage: "warehouse", location, moved_at: now, moved_by: user.username, notes: note });
    step("logs");
    for (const id of ids) db.placement_logs.push({ id: `p-${id}`, tire_id: id, location, placed_at: now, placed_by: user.username, notes: note });
    step("receipt");
    if (db.inward_receipts.some((r) => r.id === `ir-${pallet.id}`)) throw new Error("duplicate key (inward_receipts)");
    db.inward_receipts.push({
      id: `ir-${pallet.id}`, material: pallet.material, description: pallet.description, warehouse: wh.label, location,
      quantity: pallet.quantity, plan_no: pallet.plan_no, pallet_no: pallet.pallet_no, shift: pallet.shift,
      picker_name: pallet.picker_name, received_at: now, received_by: user.username, notes: "",
    });
    step("plan");
    const pn = db.plan_numbers.find((p) => p.plan_no === pallet.plan_no && p.kind === "inward");
    if (pn) pn.last_used_at = now; else db.plan_numbers.push({ plan_no: pallet.plan_no, kind: "inward", last_used_at: now });
    step("mark");
    Object.assign(pallet, { status: "put_away", warehouse: wh.label, location, putaway_by: user.username, putaway_at: now });
    return { result: "put_away", warehouse: wh.label, location, quantity: pallet.quantity };
  } catch (e) {
    const restored = JSON.parse(snap); // ROLLBACK: every table back to how it was
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, restored);
    throw e;
  } finally {
    unlock();
  }
}

async function cancelPallet(a: { p_pallet_id: string; p_user_id: string }) {
  const user = db.users.find((u) => u.id === a.p_user_id);
  if (!user) throw new Error("cancel: not logged in (unknown user)");
  const pallet = db.inward_pending.find((p) => p.id === a.p_pallet_id);
  if (!pallet) throw new Error("cancel: pallet not found");
  if (pallet.status === "cancelled") return { result: "already_cancelled" };
  if (pallet.status !== "pending") throw new Error(`cancel: pallet is ${pallet.status} and cannot be cancelled`);
  Object.assign(pallet, { status: "cancelled", cancelled_by: user.username, cancelled_at: new Date().toISOString() });
  return { result: "cancelled" };
}

async function rpc(name: string, args: any) {
  rpcCalls.push(name);
  try {
    const data = name === "putaway_pallet" ? await putawayPallet(args) : name === "cancel_pending_pallet" ? await cancelPallet(args) : (() => { throw new Error(`unknown function ${name}`); })();
    if (hooks.dropResponseOnce) { hooks.dropResponseOnce = false; return { data: null, error: { message: "network error (response lost after commit)" } }; }
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e.message } };
  }
}

export const supabase = { from: (t: string) => new Q(t), rpc };
