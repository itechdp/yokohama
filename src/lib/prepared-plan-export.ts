import ExcelJS from "exceljs";
import { saveGeneratedFile } from "@/lib/native-download";
import type { PreparedPlan } from "@/lib/prepared-plans";

// One prepared plan as an Excel sheet: title, plan no + date, then one row
// per tire (Material, description, brand, qty) and a total.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
const BORDER_ALL: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F0EA" } };

const COLUMNS = [
  { header: "SL.NO", width: 8, align: "center" as const },
  { header: "MATERIAL", width: 18, align: "left" as const },
  { header: "TIRE DESCRIPTION", width: 48, align: "left" as const },
  { header: "BRAND", width: 16, align: "left" as const },
  { header: "QTY", width: 10, align: "center" as const },
];

const safeFilenamePart = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");

export async function exportPreparedPlanExcel(plan: PreparedPlan): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yokohama WMS";
  wb.created = new Date();

  const ws = wb.addWorksheet("Plan", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });
  COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  const lastCol = COLUMNS.length;

  const cell = (row: number, col: number, value: ExcelJS.CellValue, opts: { bold?: boolean; align?: ExcelJS.Alignment["horizontal"] } = {}) => {
    const c = ws.getCell(row, col);
    c.value = value;
    c.font = { name: "Arial", size: 10, bold: opts.bold ?? false };
    c.alignment = { horizontal: opts.align ?? "left", vertical: "middle", wrapText: true };
    c.border = BORDER_ALL;
    return c;
  };

  // Row 1 — title
  ws.mergeCells(1, 1, 1, lastCol);
  const title = cell(1, 1, "Plan", { bold: true, align: "center" });
  title.font = { name: "Arial", size: 16, bold: true };
  ws.getRow(1).height = 28;

  // Row 2 — plan no | date
  ws.mergeCells(2, 1, 2, 3);
  cell(2, 1, `PLAN NO :   ${plan.planNo}`, { bold: true });
  ws.mergeCells(2, 4, 2, lastCol);
  cell(2, 4, `DATE :   ${new Date(plan.createdAt).toLocaleDateString("en-GB")}`, { bold: true });
  ws.getRow(2).height = 20;

  // Row 3 — table header
  COLUMNS.forEach((c, i) => {
    const h = cell(3, i + 1, c.header, { bold: true, align: "center" });
    h.fill = HEADER_FILL;
  });
  ws.getRow(3).height = 22;

  // Tire rows
  plan.lines.forEach((l, i) => {
    const r = 4 + i;
    cell(r, 1, i + 1, { align: "center" });
    cell(r, 2, l.material);
    cell(r, 3, l.description);
    cell(r, 4, l.brand ?? "");
    cell(r, 5, l.qty, { align: "center" });
    ws.getRow(r).height = 20;
  });

  // Total
  const totalRow = 4 + plan.lines.length;
  ws.mergeCells(totalRow, 1, totalRow, lastCol - 1);
  cell(totalRow, 1, "TOTAL", { bold: true, align: "right" });
  cell(totalRow, lastCol, plan.lines.reduce((sum, l) => sum + l.qty, 0), { bold: true, align: "center" });
  ws.getRow(totalRow).height = 20;

  ws.pageSetup.printArea = `A1:E${totalRow}`;

  const buffer = await wb.xlsx.writeBuffer();
  await saveGeneratedFile(buffer as ArrayBuffer, `plan-${safeFilenamePart(plan.planNo)}.xlsx`, XLSX_MIME);
}
