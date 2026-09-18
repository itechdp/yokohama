// Midnight today, local time, as an ISO string — the cutoff every "today
// only" query (Plan Nos, Inward receipts, Outward picks) filters against, so
// a previous day's rows stop showing up with no cleanup job required.
export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
