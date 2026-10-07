/**
 * DELETED TIRES - Excel export
 *
 * A plain data-table workbook listing every tire permanently deleted from a
 * location (Picking page's Delete button), across whatever date range the
 * History page's filters are currently set to — one row per deletion event.
 */

import ExcelJS from "exceljs";
import { saveGeneratedFile } from "@/lib/native-download";

export interface DeletedTireExportRow {
  deletedAt: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  planNo: string;
  deletedBy: string;
}

// ---------------------------------------------------------------------------
// Helpers (mirrors picking-excel-export.ts / inward-excel-export.ts)
// ---------------------------------------------------------------------------

const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
const BORDER_ALL: Partial<ExcelJS.Borders> = {
  top: THIN,
  left: THIN,
  bottom: THIN,
  right: THIN,
};
const RED = "FFB42318";

function mergeRange(
  ws: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  opts: {
    value?: ExcelJS.CellValue;
    bold?: boolean;
    fontSize?: number;
    hAlign?: ExcelJS.Alignment["horizontal"];
    vAlign?: ExcelJS.Alignment["vertical"];
    border?: Partial<ExcelJS.Borders>;
  } = {},
): ExcelJS.Cell {
  ws.mergeCells(startRow, startCol, endRow, endCol);
  const master = ws.getCell(startRow, startCol);
  master.alignment = { horizontal: opts.hAlign ?? "left", vertical: opts.vAlign ?? "middle" };
  if (opts.value !== undefined) master.value = opts.value;
  master.font = { name: "Arial", size: opts.fontSize ?? 9, bold: opts.bold ?? false, color: { argb: "FF000000" } };
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      ws.getCell(r, c).border = opts.border ?? BORDER_ALL;
    }
  }
  return master;
}

function singleCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  opts: { bold?: boolean; hAlign?: ExcelJS.Alignment["horizontal"] } = {},
): ExcelJS.Cell {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = { name: "Arial", size: 9, bold: opts.bold ?? false };
  cell.alignment = { horizontal: opts.hAlign ?? "left", vertical: "middle" };
  cell.border = BORDER_ALL;
  return cell;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  await saveGeneratedFile(buffer as ArrayBuffer, filename, XLSX_MIME);
}

function safeFilenamePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "all";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

// Column indices.
const COL_SLNO = 1;
const COL_DATE = 2;
const COL_SKU = 3;
const COL_QTY = 4;
const COL_WAREHOUSE = 5;
const COL_LOCATION = 6;
const COL_PLAN = 7;
const COL_DELETED_BY = 8;
const LAST_COL = 8;

export async function exportDeletedTiresExcel(
  rows: DeletedTireExportRow[],
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yokohama WMS";
  wb.lastModifiedBy = "Yokohama WMS";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Deleted Tires", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    properties: { showGridLines: false },
    views: [{ showGridLines: false }],
  });

  ws.getColumn(COL_SLNO).width = 6;
  ws.getColumn(COL_DATE).width = 18;
  ws.getColumn(COL_SKU).width = 30;
  ws.getColumn(COL_QTY).width = 8;
  ws.getColumn(COL_WAREHOUSE).width = 16;
  ws.getColumn(COL_LOCATION).width = 16;
  ws.getColumn(COL_PLAN).width = 16;
  ws.getColumn(COL_DELETED_BY).width = 18;

  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;

  mergeRange(ws, 1, 1, 1, LAST_COL, {
    value: "DELETED TIRES",
    bold: true,
    fontSize: 16,
    hAlign: "center",
    border: { top: { style: "medium", color: { argb: RED } }, bottom: { style: "medium", color: { argb: RED } }, left: THIN, right: THIN },
  });

  const rangeLabel = `${opts.dateFrom || "earliest"} to ${opts.dateTo || "latest"}`;
  mergeRange(ws, 2, 1, 2, LAST_COL, { value: `Date range: ${rangeLabel}`, hAlign: "center" });

  const headers = [
    { label: "S No", col: COL_SLNO },
    { label: "Deleted At", col: COL_DATE },
    { label: "SKU Code", col: COL_SKU },
    { label: "Qty", col: COL_QTY },
    { label: "Warehouse", col: COL_WAREHOUSE },
    { label: "Location", col: COL_LOCATION },
    { label: "Plan No", col: COL_PLAN },
    { label: "Deleted By", col: COL_DELETED_BY },
  ];
  for (const h of headers) {
    mergeRange(ws, 3, h.col, 3, h.col, { value: h.label, bold: true, hAlign: "center" });
  }

  const sorted = [...rows].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  sorted.forEach((r, i) => {
    const excelRow = 4 + i;
    singleCell(ws, excelRow, COL_SLNO, i + 1, { hAlign: "center" });
    singleCell(ws, excelRow, COL_DATE, formatDateTime(r.deletedAt));
    singleCell(ws, excelRow, COL_SKU, r.description ? `${r.material} - ${r.description}` : r.material);
    singleCell(ws, excelRow, COL_QTY, r.quantity, { hAlign: "center" });
    singleCell(ws, excelRow, COL_WAREHOUSE, r.warehouse);
    singleCell(ws, excelRow, COL_LOCATION, r.location);
    singleCell(ws, excelRow, COL_PLAN, r.planNo);
    singleCell(ws, excelRow, COL_DELETED_BY, r.deletedBy);
  });

  if (sorted.length === 0) {
    mergeRange(ws, 4, 1, 4, LAST_COL, { value: "No deleted tires in this date range.", hAlign: "center" });
  }

  ws.pageSetup.printArea = `A1:H${Math.max(4, 3 + sorted.length)}`;

  const today = new Date().toISOString().slice(0, 10);
  await downloadWorkbook(
    wb,
    `deleted-tires-${safeFilenamePart(opts.dateFrom ?? "")}-to-${safeFilenamePart(opts.dateTo ?? "")}-${today}.xlsx`,
  );
}
