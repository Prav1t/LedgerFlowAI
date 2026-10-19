import Papa from "papaparse";
import * as XLSX from "xlsx";
import { MAX_OCR_TEXT_CHARS, type OcrResult } from "./types";

/**
 * CSV/Excel skip OCR entirely — they're already structured. We normalize
 * to pipe-delimited rows: dense, unambiguous, and LLM-friendly for the
 * extraction stage (bank statement rows survive intact).
 */

function rowsToText(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim()))
        .join(" | ")
    )
    .filter((line) => line.replace(/[\s|]/g, "").length > 0)
    .join("\n");
}

export function parseCsv(buffer: Buffer): OcrResult {
  const parsed = Papa.parse<string[]>(buffer.toString("utf8"), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0]?.message}`);
  }
  const text = rowsToText(parsed.data).slice(0, MAX_OCR_TEXT_CHARS);
  if (!text) throw new Error("CSV contained no data rows");
  return { text, confidence: null, pageCount: 1, engine: "csv" };
}

export function parseExcel(buffer: Buffer): OcrResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false, // formatted strings — dates render as dates, not serials
      defval: "",
    });
    const body = rowsToText(rows);
    if (body) sections.push(`## Sheet: ${sheetName}\n${body}`);
  }

  if (sections.length === 0) throw new Error("Workbook contained no data");
  return {
    text: sections.join("\n\n").slice(0, MAX_OCR_TEXT_CHARS),
    confidence: null,
    pageCount: workbook.SheetNames.length,
    engine: "xlsx",
  };
}
