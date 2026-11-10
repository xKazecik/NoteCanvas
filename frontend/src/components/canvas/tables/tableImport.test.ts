import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  IMPORT_MAX_ROWS,
  decodeText,
  detectDelimiter,
  formatSerialDate,
  normalizeRows,
  parseDelimitedText,
  readTableFile,
} from "./tableImport";

describe("parseDelimitedText", () => {
  it("reads comma-separated text with quoted fields", () => {
    expect(
      parseDelimitedText('name,note\r\n"Smith, J","said ""hi"""\r\n'),
    ).toEqual([
      ["name", "note"],
      ["Smith, J", 'said "hi"'],
    ]);
  });

  it("keeps a line break inside a quoted field", () => {
    expect(parseDelimitedText('a,"two\nlines"\nb,c')).toEqual([
      ["a", "two\nlines"],
      ["b", "c"],
    ]);
  });

  it("detects semicolons, as written by Excel in many locales", () => {
    expect(parseDelimitedText("a;b;c\n1,5;2;3")).toEqual([
      ["a", "b", "c"],
      ["1,5", "2", "3"],
    ]);
  });

  it("detects tabs, as copied from a spreadsheet", () => {
    expect(detectDelimiter("a\tb, c\n1\t2")).toBe("\t");
  });

  it("treats text with no delimiter as a single column", () => {
    expect(parseDelimitedText("one\ntwo")).toEqual([["one"], ["two"]]);
  });

  it("returns nothing for blank text", () => {
    expect(parseDelimitedText(" \n ")).toEqual([]);
  });
});

describe("normalizeRows", () => {
  it("pads short rows and drops empty trailing rows and columns", () => {
    expect(normalizeRows([["a", "b", ""], ["c"], ["", "", ""]])).toEqual({
      rows: [
        ["a", "b"],
        ["c", ""],
      ],
      truncated: false,
    });
  });

  it("cuts an oversized import and says so", () => {
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 5 }, (_, i) => [
      String(i),
    ]);
    const result = normalizeRows(rows);
    expect(result.rows).toHaveLength(IMPORT_MAX_ROWS);
    expect(result.truncated).toBe(true);
  });
});

describe("formatSerialDate", () => {
  it("formats whole days as a date", () => {
    expect(formatSerialDate(45292)).toBe("2024-01-01");
  });

  it("includes the time when there is one", () => {
    expect(formatSerialDate(45292.5)).toBe("2024-01-01 12:00");
    expect(formatSerialDate(0.75)).toBe("18:00");
  });
});

describe("decodeText", () => {
  it("reads UTF-8 and UTF-16 with a byte order mark", () => {
    expect(decodeText(new TextEncoder().encode("zażółć"))).toBe("zażółć");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x61, 0x00]))).toBe("a");
  });
});

const fileOf = async (zip: JSZip, name: string) =>
  new File([await zip.generateAsync({ type: "uint8array" })], name);

describe("readTableFile", () => {
  it("reads a CSV file", async () => {
    const sheets = await readTableFile(new File(["a,b\n1,2"], "data.csv"));
    expect(sheets).toEqual([
      {
        name: "data.csv",
        rows: [
          ["a", "b"],
          ["1", "2"],
        ],
      },
    ]);
  });

  it("reads strings, numbers, dates and gaps from an .xlsx workbook", async () => {
    const zip = new JSZip();
    zip.file(
      "xl/workbook.xml",
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/first.xml"/></Relationships>`,
    );
    zip.file(
      "xl/sharedStrings.xml",
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>`,
    );
    zip.file(
      "xl/styles.xml",
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="9"/></cellXfs></styleSheet>`,
    );
    zip.file(
      "xl/worksheets/first.xml",
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Inline</t></is></c></row>
        <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>0.30000000000000004</v></c><c r="C3" s="1"><v>45292</v></c><c r="D3" s="2"><v>0.25</v></c><c r="E3" t="b"><v>1</v></c></row>
      </sheetData></worksheet>`,
    );

    const sheets = await readTableFile(await fileOf(zip, "book.xlsx"));
    expect(sheets).toEqual([
      {
        name: "Data",
        rows: [
          ["Name", "", "Inline"],
          [],
          ["Rich text", "0.3", "2024-01-01", "25%", "TRUE"],
        ],
      },
    ]);
  });

  it("reads an .ods spreadsheet, expanding repeated cells", async () => {
    const zip = new JSZip();
    zip.file(
      "content.xml",
      `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet>
        <table:table table:name="Plan">
          <table:table-row><table:table-cell><text:p>a</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"><text:p>x</text:p></table:table-cell></table:table-row>
          <table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>
        </table:table>
      </office:spreadsheet></office:body></office:document-content>`,
    );

    const [sheet] = await readTableFile(await fileOf(zip, "plan.ods"));
    expect(sheet.name).toBe("Plan");
    expect(normalizeRows(sheet.rows).rows).toEqual([["a", "x", "x"]]);
  });

  it("explains that legacy .xls is not supported", async () => {
    await expect(
      readTableFile(new File([new Uint8Array([0xd0, 0xcf, 0x11])], "old.xls")),
    ).rejects.toThrow(/\.xlsx or \.csv/);
  });
});
