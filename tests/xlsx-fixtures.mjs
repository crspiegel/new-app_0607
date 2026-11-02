// .xlsx files for the bulk upload tests (lms-bulk.spec.js), made with the same
// SheetJS file the page loads (vendor/, D48) — run in a Node sandbox, so no
// npm "xlsx" package. Not a spec file itself. Passwords here are fake.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const SHEETJS_FILE = "vendor/xlsx-0.20.3.full.min.js";
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let lib = null;
export function sheetJs() {
  if (!lib) {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(path.resolve(SHEETJS_FILE), "utf8"), sandbox);
    lib = sandbox.XLSX;
  }
  return lib;
}

// rows = arrays of cells: a string is a text cell, { n: 123 } a number cell
// (what Excel makes of 0123 in a "General" cell), null / "" an empty cell.
// → a file for page.setInputFiles.
export function xlsxFile(name, rows) {
  const XLSX = sheetJs();
  const ws = {};
  let lastCol = 0;
  rows.forEach((row, r) =>
    row.forEach((value, c) => {
      if (value === null || value === undefined || value === "") return;
      ws[XLSX.utils.encode_cell({ r, c })] =
        typeof value === "object"
          ? { t: "n", v: value.n }
          : { t: "s", v: String(value) };
      lastCol = Math.max(lastCol, c);
    }),
  );
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(rows.length - 1, 0), c: lastCol },
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return {
    name,
    mimeType: XLSX_TYPE,
    buffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
  };
}

// The first sheet of a downloaded file: cell objects by address.
export function readFirstSheet(buffer) {
  const XLSX = sheetJs();
  const wb = XLSX.read(buffer, { type: "buffer", cellNF: true });
  return { XLSX, ws: wb.Sheets[wb.SheetNames[0]], names: wb.SheetNames };
}
