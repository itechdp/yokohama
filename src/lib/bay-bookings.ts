import { supabase } from "@/lib/supabase";
import type { BayBooking, BayStatus } from "@/types/tire";

interface BayBookingRow {
  bay: number;
  pending_tire: string;
  plan_no: string;
  status: BayStatus;
  qty: number;
  updated_at: string;
}

function fromRow(row: BayBookingRow): BayBooking {
  return {
    bay: row.bay,
    pendingTire: row.pending_tire,
    planNo: row.plan_no,
    status: row.status,
    qty: row.qty,
    updatedAt: row.updated_at,
  };
}

export async function fetchBayBookings(): Promise<BayBooking[]> {
  const { data, error } = await supabase.from("bay_bookings").select("*").order("bay", { ascending: true });
  if (error) {
    console.warn("bay_bookings fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

// Keyed on bay (1-13, fixed), so saving a row always updates that bay's single record.
export async function upsertBayBooking(row: BayBooking): Promise<{ error: string | null }> {
  const { error } = await supabase.from("bay_bookings").upsert(
    {
      bay: row.bay,
      pending_tire: row.pendingTire,
      plan_no: row.planNo,
      status: row.status,
      qty: row.qty,
    },
    { onConflict: "bay" },
  );

  if (error) {
    console.warn("bay_bookings upsert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
