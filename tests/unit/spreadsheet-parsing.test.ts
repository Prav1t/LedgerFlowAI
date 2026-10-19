import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCsv, parseExcel } from "@/lib/ocr/spreadsheet";

describe("CSV parsing", () => {
  it("converts rows to pipe-delimited text", () => {
    const csv = Buffer.from("Date,Description,Amount\n2026-07-01,SHELL CANADA,189.00\n2026-07-03,E-TRANSFER,5250.00\n");
    const result = parseCsv(csv);
    expect(result.engine).toBe("csv");
    expect(result.pageCount).toBe(1);
    expect(result.confidence).toBeNull();
    expect(result.text).toBe(
      "Date | Description | Amount\n2026-07-01 | SHELL CANADA | 189.00\n2026-07-03 | E-TRANSFER | 5250.00"
    );
  });

  it("skips empty lines and trims cells", () => {
    const csv = Buffer.from("a, b ,c\n\n\n1,2,3\n");
    expect(parseCsv(csv).text).toBe("a | b | c\n1 | 2 | 3");
  });

  it("handles quoted fields containing commas", () => {
    const csv = Buffer.from('Date,Description,Amount\n2026-07-01,"STAPLES, STORE #112",63.27\n');
    expect(parseCsv(csv).text).toContain("STAPLES, STORE #112 | 63.27");
  });

  it("throws on empty input", () => {
    expect(() => parseCsv(Buffer.from(""))).toThrow();
  });
});

describe("Excel parsing", () => {
  function workbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  it("extracts every sheet with headers", () => {
    const buffer = workbookBuffer({
      Transactions: [
        ["Date", "Description", "Amount"],
        ["2026-07-01", "SHELL CANADA", 189],
      ],
      Summary: [["Opening", 1000], ["Closing", 811]],
    });
    const result = parseExcel(buffer);
    expect(result.engine).toBe("xlsx");
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("## Sheet: Transactions");
    expect(result.text).toContain("2026-07-01 | SHELL CANADA | 189");
    expect(result.text).toContain("## Sheet: Summary");
    expect(result.text).toContain("Closing | 811");
  });

  it("skips sheets with no content and throws when all are empty", () => {
    const withEmpty = workbookBuffer({ Empty: [[]], Data: [["x", 1]] });
    expect(parseExcel(withEmpty).text).not.toContain("## Sheet: Empty");
    expect(() => parseExcel(workbookBuffer({ Empty: [[]] }))).toThrow();
  });
});
