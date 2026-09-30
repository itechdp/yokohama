import * as XLSX from "xlsx";
import { saveGeneratedFile } from "@/lib/native-download";

// Excel upload for Inward. Format (first sheet with a header row):
//
//   LOCATION | PALLET | SKU | QTY
//
// One file can hold several locations — rows are grouped by Location, and a
// blank Location cell carries the one above it down (same convention as
// Prepare Plan's Plan No column). Pallet may be blank on a row; it's filled
// in on the upload preview before anything is imported. LOCATION is a raw
// bin code with no warehouse label ("B03-26"), matched to a warehouse by its
// prefix on the upload screen (see warehouseForBinCode).

export const INWARD_TEMPLATE_COLUMNS = ["LOCATION", "PALLET", "SKU", "QTY"];

export interface ParsedInwardLine {
  material: string;
  palletNo: string;
  qty: number;
}

export interface ParsedInwardLocation {
  location: string;
  lines: ParsedInwardLine[];
}

const norm = (v: unknown) => String(v ?? "").trim();
const headerKey = (v: unknown) => norm(v).toLowerCase().replace(/[^a-z]/g, "");

// Finds the header row in the first 10 rows and which column holds what.
// Without a recognisable header, falls back to the template's column order.
function findColumns(rows: unknown[][]): { location: number; pallet: number; material: number; qty: number; dataStart: number } {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const keys = rows[i].map(headerKey);
    const material = keys.findIndex((k) => k === "sku" || k === "skucode" || k === "material" || k === "materialno");
    const qty = keys.findIndex((k) => k === "qty" || k === "quantity");
    if (material === -1 || qty === -1) continue;
    return {
      location: keys.findIndex((k) => k === "location" || k === "bin" || k === "loc"),
      pallet: keys.findIndex((k) => k === "pallet" || k === "palletno"),
      material,
      qty,
      dataStart: i + 1,
    };
  }
  return { location: 0, pallet: 1, material: 2, qty: 3, dataStart: 0 };
}

export function parseInwardWorkbook(data: ArrayBuffer): { locations: ParsedInwardLocation[]; errors: string[] } {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { locations: [], errors: ["The file has no sheets."] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });

  const cols = findColumns(rows);
  const locations = new Map<string, ParsedInwardLine[]>();
  const order: string[] = [];
  const errors: string[] = [];
  let currentLocation = "";

  for (let i = cols.dataStart; i < rows.length; i++) {
    const r = rows[i];
    const excelRow = i + 1;
    const locationCell = cols.location === -1 ? "" : norm(r[cols.location]);
    if (locationCell) currentLocation = locationCell;
    const material = norm(r[cols.material]);
    const palletNo = cols.pallet === -1 ? "" : norm(r[cols.pallet]);
    const qtyRaw = norm(r[cols.qty]);
    if (!material && !qtyRaw) continue;

    if (!currentLocation) {
      errors.push(`Row ${excelRow}: no Location.`);
      continue;
    }
    if (!material) {
      errors.push(`Row ${excelRow}: SKU is empty.`);
      continue;
    }
    const qty = Number(qtyRaw);
    if (!Number.isInteger(qty) || qty < 1) {
      errors.push(`Row ${excelRow}: Qty "${qtyRaw}" for ${material} must be a whole number of 1 or more.`);
      continue;
    }

    if (!locations.has(currentLocation)) {
      locations.set(currentLocation, []);
      order.push(currentLocation);
    }
    locations.get(currentLocation)!.push({ material, palletNo, qty });
  }

  return {
    locations: order.map((location) => ({ location, lines: locations.get(location)! })),
    errors,
  };
}

// The blank format to fill in, with a couple of example rows.
export async function downloadInwardTemplate(): Promise<void> {
  const ws = XLSX.utils.aoa_to_sheet([
    INWARD_TEMPLATE_COLUMNS,
    ["B03-26", "PC03007", "42400022AL-IGU392657492", 4],
    ["", "GC3492", "32827051AL-IG392663053", 3],
  ]);
  ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inward");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  await saveGeneratedFile(buffer, "inward-upload-format.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
