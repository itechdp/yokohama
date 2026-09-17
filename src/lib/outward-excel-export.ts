/**
 * PICK SHEET - Excel export
 *
 * Recreates the paper "PICK SHEET" reference form as an A4-landscape Excel
 * workbook using ExcelJS, mirroring inward-excel-export.ts's approach for
 * the Daily Tire's Receipt & Put Away form. Only NO OF TIRES is populated
 * dynamically from real data; every other header field (Picker Name,
 * Operator Name, No.of Pallet, Plant, Date, Sheet No, Shift, Plan No) is
 * left blank for manual fill-in.
 *
 * The main table is populated from whatever Outward pick was just
 * confirmed — see tire-outward.tsx.
 */

import ExcelJS from "exceljs";
import { saveGeneratedFile } from "@/lib/native-download";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PickSheetFormRow {
  palletNo: string;
  skuCode: string;
  qty: number | string;
  location: string;
  remarks?: string;
}

export interface PickSheetFormOptions {
  noOfTires: number;
  rows: PickSheetFormRow[];
}

// ---------------------------------------------------------------------------
// Helpers (mirrors inward-excel-export.ts)
// ---------------------------------------------------------------------------

const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
const BORDER_ALL: Partial<ExcelJS.Borders> = {
  top: THIN,
  left: THIN,
  bottom: THIN,
  right: THIN,
};
const GREEN = "FF1E7145";

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
    wrapText?: boolean;
    border?: Partial<ExcelJS.Borders>;
  } = {},
): ExcelJS.Cell {
  ws.mergeCells(startRow, startCol, endRow, endCol);
  const master = ws.getCell(startRow, startCol);

  master.alignment = {
    horizontal: opts.hAlign ?? "left",
    vertical: opts.vAlign ?? "middle",
    wrapText: opts.wrapText ?? false,
  };

  if (opts.value !== undefined) master.value = opts.value;

  master.font = {
    name: "Arial",
    size: opts.fontSize ?? 9,
    bold: opts.bold ?? false,
    color: { argb: "FF000000" },
  };

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
  opts: {
    bold?: boolean;
    fontSize?: number;
    hAlign?: ExcelJS.Alignment["horizontal"];
    vAlign?: ExcelJS.Alignment["vertical"];
    wrapText?: boolean;
  } = {},
): ExcelJS.Cell {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = { name: "Arial", size: opts.fontSize ?? 9, bold: opts.bold ?? false };
  cell.alignment = {
    horizontal: opts.hAlign ?? "left",
    vertical: opts.vAlign ?? "middle",
    wrapText: opts.wrapText ?? false,
  };
  cell.border = BORDER_ALL;
  return cell;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Saves the generated workbook — a plain blob download on the web, or via
// the native Share sheet when running inside the Android APK (see
// native-download.ts for why the browser trick doesn't work there).
async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  await saveGeneratedFile(buffer as ArrayBuffer, filename, XLSX_MIME);
}

// ---------------------------------------------------------------------------
// Column indices (A=1...H=8)
// ---------------------------------------------------------------------------
const COL_SLNO = 1;
const COL_PALLET = 2;
const COL_SKU = 3;
const COL_QTY = 4;
const COL_LOCATION = 5;
const COL_REMARKS = 6;
const LAST_COL = 8;

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function exportPickSheetExcel(opts: PickSheetFormOptions): Promise<void> {
  const { noOfTires, rows } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Yokohama WMS";
  wb.lastModifiedBy = "Yokohama WMS";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Pick Sheet", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      // ExcelJS leaves these unset by default, which serializes as
      // 4294967295 (an unsigned-integer underflow of -1) in the .xlsx XML.
      // That's spec-legal but malformed-looking, and some lightweight/
      // mobile viewers fall back to their own page defaults (portrait) when
      // they hit it — setting a real DPI avoids relying on that fallback.
      horizontalDpi: 300,
      verticalDpi: 300,
    },
    properties: { showGridLines: false },
    views: [{ showGridLines: false }],
  });

  ws.pageSetup.margins = {
    left: 0.25,
    right: 0.25,
    top: 0.3,
    bottom: 0.3,
    header: 0.2,
    footer: 0.2,
  };

  // Column widths — sized so the 8 columns' total width actually fills an
  // A4 landscape page (≈153 Excel width units inside the 0.25in margins;
  // Excel's "fit to page" only ever shrinks oversized content, it never
  // stretches undersized content, so narrower columns than this leave a
  // blank strip down the right side of every printed/exported page).
  ws.getColumn(COL_SLNO).width = 8;
  ws.getColumn(COL_PALLET).width = 17;
  ws.getColumn(COL_SKU).width = 34;
  ws.getColumn(COL_QTY).width = 10;
  ws.getColumn(COL_LOCATION).width = 21;
  ws.getColumn(COL_REMARKS).width = 21;
  ws.getColumn(7).width = 21;
  ws.getColumn(LAST_COL).width = 21;

  // Row heights
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 18;
  ws.getRow(6).height = 18;
  ws.getRow(7).height = 22;

  // ROW 1 - Title, with the reference form's green top/bottom banner rule
  mergeRange(ws, 1, 1, 1, LAST_COL, {
    value: "PICK SHEET",
    bold: true,
    fontSize: 16,
    hAlign: "center",
    vAlign: "middle",
    border: {
      top: { style: "medium", color: { argb: GREEN } },
      bottom: { style: "medium", color: { argb: GREEN } },
      left: THIN,
      right: THIN,
    },
  });

  // ROW 2 - PICKER NAME
  mergeRange(ws, 2, 1, 2, 2, { value: "PICKER NAME :", bold: true, vAlign: "middle" });
  mergeRange(ws, 2, 3, 2, LAST_COL, { value: "", vAlign: "middle" });

  // ROW 3 - OPERATOR NAME
  mergeRange(ws, 3, 1, 3, 2, { value: "OPERATOR NAME :", bold: true, vAlign: "middle" });
  mergeRange(ws, 3, 3, 3, LAST_COL, { value: "", vAlign: "middle" });

  // ROW 4 - NO.OF PALLET | PLANT | DATE
  mergeRange(ws, 4, 1, 4, 2, { value: "NO.OF PALLET :", bold: true, vAlign: "middle" });
  mergeRange(ws, 4, 3, 4, 3, { value: "", vAlign: "middle" });
  mergeRange(ws, 4, 4, 4, 5, { value: "PLANT :", bold: true, vAlign: "middle" });
  mergeRange(ws, 4, 6, 4, 6, { value: "", vAlign: "middle" });
  mergeRange(ws, 4, 7, 4, 7, { value: "DATE :", bold: true, vAlign: "middle" });
  mergeRange(ws, 4, 8, 4, LAST_COL, { value: "", vAlign: "middle" });

  // ROW 5 - NO OF TIRES (dynamically populated!) | SHEET NO | SHIFT
  mergeRange(ws, 5, 1, 5, 2, { value: "NO OF TIRES :", bold: true, vAlign: "middle" });
  mergeRange(ws, 5, 3, 5, 3, {
    value: noOfTires,
    bold: true,
    fontSize: 10,
    hAlign: "center",
    vAlign: "middle",
  });
  mergeRange(ws, 5, 4, 5, 5, { value: "SHEET NO :", bold: true, vAlign: "middle" });
  mergeRange(ws, 5, 6, 5, 6, { value: "", vAlign: "middle" });
  mergeRange(ws, 5, 7, 5, 7, { value: "SHIFT :", bold: true, vAlign: "middle" });
  mergeRange(ws, 5, 8, 5, LAST_COL, { value: "", vAlign: "middle" });

  // ROW 6 - PLAN NO
  mergeRange(ws, 6, 1, 6, 2, { value: "PLAN NO :", bold: true, vAlign: "middle" });
  mergeRange(ws, 6, 3, 6, LAST_COL, { value: "", vAlign: "middle" });

  // ROW 7 - Table column headers
  const headers = [
    { label: "SI.NO", startCol: COL_SLNO, endCol: COL_SLNO },
    { label: "PALLET NO", startCol: COL_PALLET, endCol: COL_PALLET },
    { label: "SKU CODE", startCol: COL_SKU, endCol: COL_SKU },
    { label: "QTY", startCol: COL_QTY, endCol: COL_QTY },
    { label: "LOCATION", startCol: COL_LOCATION, endCol: COL_LOCATION },
    { label: "REMARK", startCol: COL_REMARKS, endCol: LAST_COL },
  ];

  for (const h of headers) {
    mergeRange(ws, 7, h.startCol, 7, h.endCol, {
      value: h.label,
      bold: true,
      fontSize: 9,
      hAlign: "center",
      vAlign: "middle",
      wrapText: true,
    });
  }

  // Data rows - minimum 20 blank rows even if fewer records
  const DATA_ROWS = Math.max(rows.length, 20);

  for (let i = 0; i < DATA_ROWS; i++) {
    const excelRow = 8 + i;
    ws.getRow(excelRow).height = 20;

    const d = rows[i];

    singleCell(ws, excelRow, COL_SLNO, i + 1, { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_PALLET, d?.palletNo ?? "", { vAlign: "middle" });
    singleCell(ws, excelRow, COL_SKU, d?.skuCode ?? "", { vAlign: "middle" });
    singleCell(ws, excelRow, COL_QTY, d?.qty ?? "", { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_LOCATION, d?.location ?? "", { vAlign: "middle" });
    mergeRange(ws, excelRow, COL_REMARKS, excelRow, LAST_COL, {
      value: d?.remarks ?? "",
      vAlign: "middle",
    });
  }

  // Footer — Picker Name / Operator Name / Sign boxes, as shown on the
  // reference form.
  const footerRow = 9 + DATA_ROWS;
  ws.getRow(footerRow).height = 20;
  ws.getRow(footerRow + 1).height = 20;
  mergeRange(ws, footerRow, 1, footerRow, 3, { value: "PICKER NAME", bold: true, vAlign: "middle" });
  mergeRange(ws, footerRow, 4, footerRow, 5, { value: "", vAlign: "middle" });
  mergeRange(ws, footerRow, 6, footerRow, 7, { value: "OPERATOR NAME", bold: true, vAlign: "middle" });
  mergeRange(ws, footerRow, 8, footerRow, LAST_COL, { value: "", vAlign: "middle" });
  mergeRange(ws, footerRow + 1, 1, footerRow + 1, 5, { value: "", vAlign: "middle" });
  mergeRange(ws, footerRow + 1, 6, footerRow + 1, 7, { value: "SIGN", bold: true, vAlign: "middle" });
  mergeRange(ws, footerRow + 1, 8, footerRow + 1, LAST_COL, { value: "", vAlign: "middle" });

  // Print area
  ws.pageSetup.printArea = `A1:H${footerRow + 1}`;

  await downloadWorkbook(wb, `pick-sheet-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
