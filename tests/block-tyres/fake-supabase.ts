/* eslint-disable */
// A small in-memory model of the plan_block_tires table, enough for the app's
// queries: insert().select().single(), and select with eq / gte / lt / order / range.
// It enforces the same rules as supabase/migrations/plan_block_tires.sql
// (unique plan+tyre among STILL-BLOCKED rows ignoring case/spaces, qty 1..99999, non-blank
// text, unblock only through the two functions); the SQL
// itself is tested in tests/sql.
type Row = Record<string, any>;
export const state = { rows: [] as Row[], nextId: 1, now: () => new Date().toISOString(), failSelect: null as string | null, failRpc: null as string | null };
export function reset() {
  state.rows = [];
  state.nextId = 1;
  state.now = () => new Date().toISOString();
  state.failSelect = null;
  state.failRpc = null;
}
const norm = (v: string) => v.trim().toLowerCase();

function table(name: string) {
  if (name !== "plan_block_tires") throw new Error("unexpected table " + name);
  return {
    insert(values: Row) {
      let result: { data: Row | null; error: { code?: string; message: string } | null };
      if (!values.plan_no?.trim() || !values.material?.trim()) result = { data: null, error: { code: "23514", message: "check constraint" } };
      else if (!(values.qty >= 1 && values.qty <= 99999)) result = { data: null, error: { code: "23514", message: "check constraint" } };
      else if (values.unblocked_at != null) result = { data: null, error: { code: "42501", message: "row-level security" } };
      else if (state.rows.some((r) => !r.unblocked_at && norm(r.plan_no) === norm(values.plan_no) && norm(r.material) === norm(values.material)))
        result = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      else {
        const row = { id: state.nextId++, description: "", created_by: "", created_at: state.now(), unblocked_at: null, unblocked_by: "", ...values };
        state.rows.push(row);
        result = { data: row, error: null };
      }
      const chain: any = { select: () => chain, single: () => Promise.resolve(result) };
      return chain;
    },
    select() {
      const filters: ((r: Row) => boolean)[] = [];
      const orders: { col: string; asc: boolean }[] = [];
      let range: [number, number] | null = null;
      const chain: any = {
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), chain),
        gte: (c: string, v: string) => (filters.push((r) => new Date(r[c]) >= new Date(v)), chain),
        lt: (c: string, v: string) => (filters.push((r) => new Date(r[c]) < new Date(v)), chain),
        order: (col: string, o: { ascending: boolean }) => (orders.push({ col, asc: o.ascending }), chain),
        range: (a: number, b: number) => ((range = [a, b]), chain),
        then: (resolve: any, reject: any) => {
          if (state.failSelect) return Promise.resolve({ data: null, error: { message: state.failSelect } }).then(resolve, reject);
          let out = state.rows.filter((r) => filters.every((f) => f(r)));
          out = out.sort((x, y) => {
            for (const o of orders) {
              const a = x[o.col], b = y[o.col];
              if (a === b) continue;
              return (a < b ? -1 : 1) * (o.asc ? 1 : -1);
            }
            return 0;
          });
          if (range) out = out.slice(range[0], Math.min(range[1], 999 + range[0]) + 1); // Supabase caps a response at 1000 rows
          return Promise.resolve({ data: out, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}
function rpc(name: string, args: Row) {
  if (state.failRpc) return Promise.resolve({ data: null, error: { message: state.failRpc } });
  if (name === "unblock_plan_tyre") {
    const row = state.rows.find((r) => r.id === args.p_id);
    if (!row) return Promise.resolve({ data: null, error: { message: "unblock: record not found" } });
    if (row.unblocked_at) return Promise.resolve({ data: { result: "already_unblocked" }, error: null });
    row.unblocked_at = state.now();
    row.unblocked_by = (args.p_by ?? "").trim();
    return Promise.resolve({ data: { result: "unblocked" }, error: null });
  }
  if (name === "unblock_plan_tyres") {
    if (!String(args.p_plan_no ?? "").trim()) return Promise.resolve({ data: null, error: { message: "unblock: plan number is required" } });
    let n = 0;
    for (const r of state.rows) if (!r.unblocked_at && norm(r.plan_no) === norm(args.p_plan_no)) { r.unblocked_at = state.now(); r.unblocked_by = (args.p_by ?? "").trim(); n++; }
    return Promise.resolve({ data: n, error: null });
  }
  return Promise.resolve({ data: null, error: { message: "unknown function " + name } });
}
export const supabase = { from: table, rpc };
