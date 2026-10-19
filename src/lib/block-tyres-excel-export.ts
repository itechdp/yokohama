/**
 * BLOCK TYRES - Excel export
 *
 * A plain data-table workbook listing every saved Block Tyres record (Plan No,
 * SKU, description, qty, who saved it, when), for whatever filters the Block
 * Tyres history page currently has. Same look as deleted-tires-excel-export.ts.
 */

import ExcelJS from "exceljs";
import { saveGeneratedFile } from "@/lib/native-download";
import { isBlocked } from "@/lib/plan-block-tires";
import type { PlanBlockTire } from "@/types/tire";

const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
const BORDER_ALL: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const RED = "FFB42318";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COLUMNS = [
  { header: "S No", width: 6, align: "center" as const },
  { header: "Date (IST)", width: 20, align: "left" as const },
  { header: "Plan No", width: 18, align: "left" as const },
  { header: "SKU Code", width: 26, align: "left" as const },
  { header: "Description", width: 44, align: "left" as const },
  { header: "Qty", width: 8, align: "center" as const },
  { header: "Operator", width: 18, align: "left" as const },
  { header: "Status", width: 12, align: "center" as const },
  { header: "Unblocked At (IST)", width: 20, align: "left" as const },
  { header: "Unblocked By", width: 16, align: "left" as const },
];

function formatIstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function styled(cell: ExcelJS.Cell, opts: { bold?: boolean; size?: number; align?: ExcelJS.Alignment["horizontal"] } = {}) {
  cell.font = { name: "Arial", size: opts.size ?? 9, bold: opts.bold ?? false };
  cell.alignment = { horizontal: opts.align ?? "left", vertical: "middle", wrapText: true };
  cell.border = BORDER_ALL;
}

export function buildBlockTyresWorkbook(rows: PlanBlockTire[], opts: { dateFrom?: string; dateTo?: string } = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yokohama WMS";
  wb.lastModifiedBy = "Yokohama WMS";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Block Tyres", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { showGridLines: false },
    views: [{ showGridLines: false }],
  });
  COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  const last = COLUMNS.length;

  ws.getRow(1).height = 22;
  ws.mergeCells(1, 1, 1, last);
  const title = ws.getCell(1, 1);
  title.value = "BLOCK TYRES";
  styled(title, { bold: true, size: 16, align: "center" });
  title.border = { top: { style: "medium", color: { argb: RED } }, bottom: { style: "medium", color: { argb: RED } }, left: THIN, right: THIN };

  ws.mergeCells(2, 1, 2, last);
  const range = ws.getCell(2, 1);
  range.value = `Date range: ${opts.dateFrom || "earliest"} to ${opts.dateTo || "latest"}`;
  styled(range, { align: "center" });

  COLUMNS.forEach((c, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = c.header;
    styled(cell, { bold: true, align: "center" });
  });

  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  sorted.forEach((r, idx) => {
    const values: ExcelJS.CellValue[] = [
      idx + 1,
      formatIstDateTime(r.createdAt),
      r.planNo,
      r.material,
      r.description,
      r.qty,
      r.createdBy,
      isBlocked(r) ? "Blocked" : "Unblocked",
      r.unblockedAt ? formatIstDateTime(r.unblockedAt) : "",
      r.unblockedBy ?? "",
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(4 + idx, i + 1);
      cell.value = v;
      styled(cell, { align: COLUMNS[i].align });
    });
  });

  const totalRow = 4 + sorted.length;
  ws.mergeCells(totalRow, 1, totalRow, 5);
  const label = ws.getCell(totalRow, 1);
  label.value = "TOTAL BLOCKED (currently)";
  styled(label, { bold: true, align: "right" });
  const total = ws.getCell(totalRow, 6);
  total.value = sorted.filter(isBlocked).reduce((sum, r) => sum + r.qty, 0);
  styled(total, { bold: true, align: "center" });
  for (let c = 7; c <= last; c++) styled(ws.getCell(totalRow, c));

  return wb;
}

function safePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "all";
}

export async function exportBlockTyresExcel(rows: PlanBlockTire[], opts: { dateFrom?: string; dateTo?: string } = {}): Promise<void> {
  const wb = buildBlockTyresWorkbook(rows, opts);
  const buffer = await wb.xlsx.writeBuffer();
  await saveGeneratedFile(buffer as ArrayBuffer, opts.dateFrom || opts.dateTo ? `block-tyres-${safePart(opts.dateFrom ?? "all")}-to-${safePart(opts.dateTo ?? "all")}.xlsx` : "block-tyres-all.xlsx", XLSX_MIME);
}
