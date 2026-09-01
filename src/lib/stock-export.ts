import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// One grouped stock row, already de-duplicated by whatever grouping the
// caller used (see groupResultsBySerial / buildGlobalExportRows in
// tire-stock.tsx) — this module has no idea what a tire, bin, or warehouse
// is, it only knows how to turn rows + a column list into a file. That keeps
// export format code fully reusable and free of any duplicated filtering.
export interface StockExportRow {
  serialNumber: string;
  brand: string;
  model: string;
  warehouse: string;
  row: string;
  position: string;
  floor: string;
  quantity: number;
}

export interface StockExportColumn {
  key: keyof StockExportRow;
  header: string;
}

// Global export spans every location, so Warehouse/Row/Position are real
// per-row columns.
export const GLOBAL_STOCK_EXPORT_COLUMNS: StockExportColumn[] = [
  { key: "serialNumber", header: "Serial No." },
  { key: "brand", header: "Brand" },
  { key: "model", header: "Model" },
  { key: "warehouse", header: "Warehouse" },
  { key: "row", header: "Row" },
  { key: "position", header: "Position" },
  { key: "floor", header: "Floor" },
  { key: "quantity", header: "Quantity" },
];

// Location export is already scoped to one Warehouse+Row+Position (shown
// once above the table instead), so those columns would just repeat.
export const LOCATION_STOCK_EXPORT_COLUMNS: StockExportColumn[] = [
  { key: "serialNumber", header: "Serial No." },
  { key: "brand", header: "Brand" },
  { key: "model", header: "Model" },
  { key: "floor", header: "Floor" },
  { key: "quantity", header: "Quantity" },
];

// Keeps generated filenames valid across platforms (no spaces, slashes, etc).
export function sanitizeForFilename(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

const columnWidth = (key: keyof StockExportRow): number => {
  if (key === "model") return 40;
  if (key === "warehouse") return 18;
  return 14;
};

export function exportStockToExcel(rows: StockExportRow[], columns: StockExportColumn[], filename: string): void {
  if (rows.length === 0) return;
  const sheetRows = rows.map((row) => {
    const record: Record<string, string | number> = {};
    for (const col of columns) record[col.header] = row[col.key];
    return record;
  });
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  sheet["!cols"] = columns.map((col) => ({ wch: columnWidth(col.key) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Stock");
  XLSX.writeFile(workbook, filename);
}

export function exportStockToPDF(
  rows: StockExportRow[],
  columns: StockExportColumn[],
  opts: { title: string; subtitleLines?: string[]; filename: string },
): void {
  if (rows.length === 0) return;
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(opts.title, 14, 16);

  let y = 24;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  const lines = [...(opts.subtitleLines ?? []), `Generated On: ${new Date().toLocaleString()}`];
  for (const line of lines) {
    doc.text(line, 14, y);
    y += 5;
  }

  const modelColIndex = columns.findIndex((c) => c.key === "model");

  autoTable(doc, {
    startY: y + 3,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(row[c.key]))),
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    ...(modelColIndex >= 0 ? { columnStyles: { [modelColIndex]: { cellWidth: 90 } } } : {}),
  });

  doc.save(opts.filename);
}
