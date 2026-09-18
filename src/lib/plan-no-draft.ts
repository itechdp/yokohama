import type { PlanNoKind } from "@/lib/plan-numbers";

// Remembers whatever Plan No is currently typed/selected on screen, per
// device and per flow (Inward/Outward kept separate — see PlanNoKind), so it
// survives navigating away and back or reloading the page — it only changes
// when the operator actually edits it. This is purely a per-device draft:
// the dropdown of *which* plan numbers exist is still entirely DB-backed
// (see plan-numbers.ts) and unaffected by this.
//
// Scoped to "today" — a plan number means nothing once the date rolls over,
// so a value left over from a previous day is treated as unset rather than
// silently carrying into the next day's work.
const STORAGE_KEY_PREFIX = "yokohama.planNoDraft";

interface StoredPlanNo {
  date: string; // local YYYY-MM-DD
  planNo: string;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getStoredPlanNo(kind: PlanNoKind): string {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}.${kind}`);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as StoredPlanNo;
    return parsed.date === today() ? (parsed.planNo ?? "") : "";
  } catch {
    return "";
  }
}

export function setStoredPlanNo(kind: PlanNoKind, planNo: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}.${kind}`;
    const trimmed = planNo.trim();
    if (!trimmed) {
      localStorage.removeItem(key);
      return;
    }
    const value: StoredPlanNo = { date: today(), planNo: trimmed };
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can throw in private-browsing/restricted contexts — the Plan No
    // input still works for the current session, it just won't persist.
  }
}
