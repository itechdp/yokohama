// Older records store the shift as "1" / "2" / "3"; the pages now store "Day" / "Night".
// Show both readably: numbers keep their "Shift N" wording, anything else is shown as it is.
export function shiftLabel(shift: string): string {
  const s = shift.trim();
  return /^\d+$/.test(s) ? `Shift ${s}` : s;
}

export const SHIFT_OPTIONS = [
  { value: "Day", label: "Day" },
  { value: "Night", label: "Night" },
];

/**
 * The dropdown options. Picking or Outward can load an older plan whose shift is "1"/"2"/"3";
 * keep that value visible (as "Shift N") instead of showing an empty box that still holds a value.
 * It goes away as soon as Day or Night is chosen.
 */
export function withCurrentShift(current: string): { value: string; label: string }[] {
  const c = current.trim();
  return !c || SHIFT_OPTIONS.some((o) => o.value === c) ? SHIFT_OPTIONS : [...SHIFT_OPTIONS, { value: c, label: shiftLabel(c) }];
}
