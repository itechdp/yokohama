/**
 * Daily Tire's Receipt & Put Away - Excel export
 *
 * Recreates the paper reference form as an A4-landscape Excel workbook using
 * ExcelJS. Only NO OF TIRES RECV is populated dynamically from real data;
 * every other header field is left blank so it can be filled in by hand,
 * exactly like the paper form.
 *
 * The header block is a strict 3-column grid (LEFT / MID / RIGHT), matching
 * the reference photo: LEFT carries one full-width label per row, MID and
 * RIGHT carry a second/third label only on the rows that have one (Plant +
 * Date, Sheet No + Shift) and stay blank otherwise — not the finer,
 * mismatched column split an earlier version used.
 */

import ExcelJS from "exceljs";
import { saveGeneratedFile } from "@/lib/native-download";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InwardFormRow {
  palletNo: string;
  skuCode: string;
  qty: number | string;
  receivedTime: string;
  actual?: string;
  putTime: string;
  totalTime?: string;
  remarks?: string;
}

export interface InwardFormOptions {
  noOfTiresRecv: number;
  rows: InwardFormRow[];
}

// ---------------------------------------------------------------------------
// Helpers
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
// Column indices (A=1...I=9) — one real grid column per table column, no
// extra filler columns.
// ---------------------------------------------------------------------------
const COL_SLNO = 1;
const COL_PALLET = 2;
const COL_SKU = 3;
const COL_QTY = 4;
const COL_RECV_TIME = 5;
const COL_ACTUAL = 6;
const COL_PUT_TIME = 7;
const COL_TOTAL_TIME = 8;
const COL_REMARKS = 9;
const LAST_COL = 9;

// Header block's 3-region split, reusing the same 9 physical columns as the
// table below it (so column widths only need to be defined once) — LEFT
// lands close to half the sheet width since it spans the SKU CODE column,
// the widest one.
const LEFT_START = 1;
const LEFT_END = 5;
const MID_START = 6;
const MID_END = 7;
const RIGHT_START = 8;
const RIGHT_END = 9;

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function exportInwardReceiptExcel(opts: InwardFormOptions): Promise<void> {
  const { noOfTiresRecv, rows } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Yokohama WMS";
  wb.lastModifiedBy = "Yokohama WMS";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Inward Receipt", {
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

  // Column widths — sized so the 9 columns' total width actually fills an
  // A4 landscape page (≈153 Excel width units inside the 0.25in margins;
  // Excel's "fit to page" only ever shrinks oversized content, it never
  // stretches undersized content, so narrower columns than this leave a
  // blank strip down the right side of every printed/exported page).
  ws.getColumn(COL_SLNO).width = 8;
  ws.getColumn(COL_PALLET).width = 17;
  ws.getColumn(COL_SKU).width = 36;
  ws.getColumn(COL_QTY).width = 10;
  ws.getColumn(COL_RECV_TIME).width = 17;
  ws.getColumn(COL_ACTUAL).width = 14;
  ws.getColumn(COL_PUT_TIME).width = 15;
  ws.getColumn(COL_TOTAL_TIME).width = 15;
  ws.getColumn(COL_REMARKS).width = 21;

  // Row heights
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 18;
  ws.getRow(6).height = 18;
  ws.getRow(7).height = 30;

  // ROW 1 - Title, with the reference form's green top/bottom banner rule
  mergeRange(ws, 1, 1, 1, LAST_COL, {
    value: "Daily Tire's Receipt & Put away",
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

  // ROW 2 - FID SUPERVISOR NAME (LEFT only; MID/RIGHT blank, same as the form)
  mergeRange(ws, 2, LEFT_START, 2, LEFT_END, { value: "FID SUPERVISOR NAME :", bold: true, vAlign: "middle" });
  mergeRange(ws, 2, MID_START, 2, MID_END, { value: "", vAlign: "middle" });
  mergeRange(ws, 2, RIGHT_START, 2, RIGHT_END, { value: "", vAlign: "middle" });

  // ROW 3 - OPERATOR NAME (same pattern)
  mergeRange(ws, 3, LEFT_START, 3, LEFT_END, { value: "OPERATOR NAME :", bold: true, vAlign: "middle" });
  mergeRange(ws, 3, MID_START, 3, MID_END, { value: "", vAlign: "middle" });
  mergeRange(ws, 3, RIGHT_START, 3, RIGHT_END, { value: "", vAlign: "middle" });

  // ROW 4 - NO.OF PALLET RECV | PLANT | DATE
  mergeRange(ws, 4, LEFT_START, 4, LEFT_END, { value: "NO.OF PALLET RECV :", bold: true, vAlign: "middle" });
  mergeRange(ws, 4, MID_START, 4, MID_END, { value: "PLANT :", bold: true, vAlign: "middle" });
  mergeRange(ws, 4, RIGHT_START, 4, RIGHT_END, { value: "DATE :", bold: true, vAlign: "middle" });

  // ROW 5 - NO OF TIRES RECV (dynamically populated!) | SHEET NO | SHIFT
  mergeRange(ws, 5, LEFT_START, 5, LEFT_END, {
    value: `NO OF TIRES RECV :   ${noOfTiresRecv}`,
    bold: true,
    vAlign: "middle",
  });
  mergeRange(ws, 5, MID_START, 5, MID_END, { value: "SHEET NO :", bold: true, vAlign: "middle" });
  mergeRange(ws, 5, RIGHT_START, 5, RIGHT_END, { value: "SHIFT :", bold: true, vAlign: "middle" });

  // ROW 6 - NO OF NS RECV (LEFT only; rest of the row blank)
  mergeRange(ws, 6, LEFT_START, 6, LEFT_END, { value: "NO OF NS RECV :", bold: true, vAlign: "middle" });
  mergeRange(ws, 6, MID_START, 6, LAST_COL, { value: "", vAlign: "middle" });

  // ROW 7 - Table column headers
  const headers = [
    { label: "SL.NO", startCol: COL_SLNO, endCol: COL_SLNO },
    { label: "PALLET NO", startCol: COL_PALLET, endCol: COL_PALLET },
    { label: "SKU CODE", startCol: COL_SKU, endCol: COL_SKU },
    { label: "QTY", startCol: COL_QTY, endCol: COL_QTY },
    { label: "RECEIVED TIME", startCol: COL_RECV_TIME, endCol: COL_RECV_TIME },
    { label: "ACTUAL", startCol: COL_ACTUAL, endCol: COL_ACTUAL },
    { label: "PUT TIME", startCol: COL_PUT_TIME, endCol: COL_PUT_TIME },
    { label: "TOTAL TIME", startCol: COL_TOTAL_TIME, endCol: COL_TOTAL_TIME },
    { label: "REMARKS", startCol: COL_REMARKS, endCol: COL_REMARKS },
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
    ws.getRow(excelRow).height = 18;

    const d = rows[i];

    singleCell(ws, excelRow, COL_SLNO, i + 1, { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_PALLET, d?.palletNo ?? "", { vAlign: "middle" });
    singleCell(ws, excelRow, COL_SKU, d?.skuCode ?? "", { vAlign: "middle" });
    singleCell(ws, excelRow, COL_QTY, d?.qty ?? "", { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_RECV_TIME, d?.receivedTime ?? "", { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_ACTUAL, d?.actual ?? "", { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_PUT_TIME, d?.putTime ?? "", { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_TOTAL_TIME, d?.totalTime ?? "", { hAlign: "center", vAlign: "middle" });
    singleCell(ws, excelRow, COL_REMARKS, d?.remarks ?? "", { vAlign: "middle" });
  }

  // Print area
  ws.pageSetup.printArea = `A1:I${7 + DATA_ROWS}`;

  await downloadWorkbook(wb, `inward-receipt-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
