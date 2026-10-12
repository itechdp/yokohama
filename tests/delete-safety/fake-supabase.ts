/* eslint-disable */
// In-memory stand-in for the supabase client - same call chain the delete code
// uses. Lets the delete-safety tests run with no network and no real database.
// `hooks.beforeDelete` runs between the code's read and its delete, to
// simulate another device changing a tire in that gap.
type Row = Record<string, any>;
export const db: Record<string, Row[]> = { tires: [], warehouses: [] };
export const log: string[] = [];
export const hooks: { beforeDelete?: () => void } = {};
class Q {
  filters: ((r: Row) => boolean)[] = [];
  mode: "select" | "delete" = "select";
  constructor(private t: string) {}
  select(_c?: string) { return this; }
  delete() { this.mode = "delete"; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  then(res: any) {
    if (this.mode === "delete") {
      hooks.beforeDelete?.();
      hooks.beforeDelete = undefined;
    }
    return this.run(res);
  }
  private run(res: any) {
    const hit = db[this.t].filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === "delete") { log.push(`DELETE ${this.t} ${hit.length}`); db[this.t] = db[this.t].filter((r) => !hit.includes(r)); }
    return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null }).then(res);
  }
}
export const supabase = { from: (t: string) => new Q(t) };
