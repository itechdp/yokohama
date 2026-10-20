import { useCallback, useState } from "react";
import type { CaseNo } from "@/types/tire";

const STORAGE_KEY = "yokohama_selected_case";

function readStoredCase(): CaseNo | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "1" ? 1 : raw === "2" ? 2 : null;
  } catch {
    return null;
  }
}

// The Cage 1 / Cage 2 the operator last picked, shared by Inward and Putaway
// through local storage (per device) so each page opens on the same case.
// null until a case has been chosen once.
// eslint-disable-next-line no-unused-vars
export function useSelectedCase(): [CaseNo | null, (next: CaseNo) => void] {
  const [caseNo, setCaseNo] = useState<CaseNo | null>(readStoredCase);
  const select = useCallback((next: CaseNo) => {
    setCaseNo(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // storage unavailable - the choice still holds for this page visit.
    }
  }, []);
  return [caseNo, select];
}
