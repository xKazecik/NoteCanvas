import JSZip from "jszip";

/** A grid of cell text, one array per row. */
export type TableRows = string[][];

export type ImportedSheet = { name: string; rows: TableRows };

/**
 * A table drawn on a canvas is not a spreadsheet: every cell is laid out and
 * painted, so a huge import would make the whole drawing crawl.
 */
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_COLS = 50;

const DELIMITERS = [",", ";", "\t", "|"] as const;

/** Split delimited text into records, honouring double-quoted fields. */
const splitDelimited = (text: string, delimiter: string): TableRows => {
  const rows: TableRows = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  /** Whether the current cell opened with a quote, so `"a" ` keeps no quote. */
  let wasQuoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "" && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
      cell = "";
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
      wasQuoted = false;
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      wasQuoted = false;
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
};

/**
 * Which delimiter the text uses: the one that splits the first lines into the
 * most columns while giving every line the same count. Tabs win ties, since
 * that is what a spreadsheet puts on the clipboard.
 */
export const detectDelimiter = (text: string): string => {
  const sample = text.split("\n").slice(0, 20).join("\n");
  let best = { delimiter: ",", score: 0 };
  for (const delimiter of DELIMITERS) {
    const counts = splitDelimited(sample, delimiter)
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => row.length);
    if (!counts.length) {
      continue;
    }
    const columns = Math.min(...counts);
    const consistent = counts.every((count) => count === counts[0]);
    const score =
      columns <= 1 ? 0 : columns * (consistent ? 2 : 1) + (delimiter === "\t" ? 0.5 : 0);
    if (score > best.score) {
      best = { delimiter, score };
    }
  }
  return best.delimiter;
};

/** Parse CSV / TSV / semicolon- or pipe-separated text into rows. */
export const parseDelimitedText = (text: string): TableRows => {
  const source = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!source.trim()) {
    return [];
  }
  return splitDelimited(source.replace(/\n+$/, ""), detectDelimiter(source));
};

/**
 * Make rows rectangular and drop what an export tends to leave behind: empty
 * rows at the bottom and empty columns on the right. Reports whether the
 * size limit cut anything off.
 */
export const normalizeRows = (
  rows: TableRows,
): { rows: TableRows; truncated: boolean } => {
  const trimmed = rows.map((row) => row.map((cell) => cell.trim()));
  while (trimmed.length && trimmed[trimmed.length - 1].every((cell) => !cell)) {
    trimmed.pop();
  }
  let cols = 0;
  for (const row of trimmed) {
    for (let col = row.length - 1; col >= cols; col--) {
      if (row[col]) {
        cols = col + 1;
        break;
      }
    }
  }
  const truncated = trimmed.length > IMPORT_MAX_ROWS || cols > IMPORT_MAX_COLS;
  const width = Math.min(cols, IMPORT_MAX_COLS);
  return {
    rows: trimmed
      .slice(0, IMPORT_MAX_ROWS)
      .map((row) => Array.from({ length: width }, (_, col) => row[col] ?? "")),
    truncated,
  };
};

// ---------------------------------------------------------------------------
// Spreadsheet files. Both formats are zip archives of XML, read here directly
// rather than through a spreadsheet library: only cell text is wanted.
// ---------------------------------------------------------------------------

const parseXml = (source: string) =>
  new DOMParser().parseFromString(source, "application/xml");

const byTag = (node: Document | Element, name: string) =>
  Array.from(node.getElementsByTagNameNS("*", name));

/** "C7" -> 2. */
const columnIndex = (ref: string): number => {
  let index = 0;
  for (const char of ref) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) {
      break;
    }
    index = index * 26 + (code - 64);
  }
  return index - 1;
};

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

const isDateFormatCode = (code: string) =>
  /[dmyhs]/i.test(
    code
      .replace(/"[^"]*"/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\\./g, "")
      .replace(/general/i, ""),
  );

type NumberKind = "date" | "percent" | "plain";

/** How each cell style index (the `s` attribute) wants its number shown. */
const readNumberKinds = (stylesXml: string | null): NumberKind[] => {
  if (!stylesXml) {
    return [];
  }
  const doc = parseXml(stylesXml);
  const custom = new Map<number, string>();
  for (const format of byTag(doc, "numFmt")) {
    custom.set(
      Number(format.getAttribute("numFmtId")),
      format.getAttribute("formatCode") ?? "",
    );
  }
  const cellXfs = byTag(doc, "cellXfs")[0];
  if (!cellXfs) {
    return [];
  }
  return byTag(cellXfs, "xf").map((xf) => {
    const id = Number(xf.getAttribute("numFmtId") ?? 0);
    const code = custom.get(id);
    if (code !== undefined) {
      if (isDateFormatCode(code)) {
        return "date";
      }
      return code.includes("%") ? "percent" : "plain";
    }
    if (BUILTIN_DATE_FORMATS.has(id)) {
      return "date";
    }
    return id === 9 || id === 10 ? "percent" : "plain";
  });
};

const pad = (value: number) => String(value).padStart(2, "0");

/** A spreadsheet serial day number as an ISO-style date and/or time. */
export const formatSerialDate = (serial: number, date1904 = false): string => {
  const days = Math.floor(serial);
  const seconds = Math.round((serial - days) * 86400);
  const date = new Date(
    Date.UTC(1899, 11, 30 + days + (date1904 ? 1462 : 0), 0, 0, seconds),
  );
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${
    date.getUTCSeconds() ? `:${pad(date.getUTCSeconds())}` : ""
  }`;
  if (!seconds) {
    return day;
  }
  return days === 0 ? time : `${day} ${time}`;
};

/** Trim the float noise a spreadsheet stores, e.g. 0.30000000000000004. */
const tidyNumber = (value: number) => String(parseFloat(value.toPrecision(12)));

const formatNumber = (raw: string, kind: NumberKind, date1904: boolean) => {
  const value = Number(raw);
  if (raw === "" || Number.isNaN(value)) {
    return raw;
  }
  if (kind === "date") {
    return formatSerialDate(value, date1904);
  }
  if (kind === "percent") {
    return `${tidyNumber(value * 100)}%`;
  }
  return tidyNumber(value);
};

/** The text of a `<si>` or `<is>` string item, without phonetic guides. */
const stringItemText = (item: Element) =>
  byTag(item, "t")
    .filter((node) => node.parentElement?.localName !== "rPh")
    .map((node) => node.textContent ?? "")
    .join("");

const readZipText = async (zip: JSZip, path: string) =>
  (await zip.file(path.replace(/^\//, ""))?.async("string")) ?? null;

const parseXlsx = async (zip: JSZip): Promise<ImportedSheet[]> => {
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  if (!workbookXml) {
    throw new Error("This file is not a valid Excel workbook.");
  }
  const workbook = parseXml(workbookXml);
  const date1904 = byTag(workbook, "workbookPr").some((node) =>
    ["1", "true"].includes(node.getAttribute("date1904") ?? ""),
  );

  const targets = new Map<string, string>();
  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  if (relsXml) {
    for (const rel of byTag(parseXml(relsXml), "Relationship")) {
      const target = rel.getAttribute("Target") ?? "";
      targets.set(
        rel.getAttribute("Id") ?? "",
        target.startsWith("/") ? target.slice(1) : `xl/${target}`,
      );
    }
  }

  const sharedXml = await readZipText(zip, "xl/sharedStrings.xml");
  const shared = sharedXml
    ? byTag(parseXml(sharedXml), "si").map(stringItemText)
    : [];
  const kinds = readNumberKinds(await readZipText(zip, "xl/styles.xml"));

  const sheets: ImportedSheet[] = [];
  const sheetNodes = byTag(workbook, "sheet");
  for (let index = 0; index < sheetNodes.length; index++) {
    const node = sheetNodes[index];
    const relId =
      node.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ) ?? node.getAttribute("r:id");
    const path =
      (relId && targets.get(relId)) || `xl/worksheets/sheet${index + 1}.xml`;
    const sheetXml = await readZipText(zip, path);
    if (!sheetXml) {
      continue;
    }

    const rows: TableRows = [];
    for (const rowNode of byTag(parseXml(sheetXml), "row")) {
      const rowIndex = Number(rowNode.getAttribute("r") ?? rows.length + 1) - 1;
      if (rowIndex >= IMPORT_MAX_ROWS + 1) {
        // one past the limit, so the caller can tell rows were cut off
        break;
      }
      const row: string[] = (rows[rowIndex] ??= []);
      let nextCol = 0;
      for (const cell of byTag(rowNode, "c")) {
        const ref = cell.getAttribute("r");
        const col = ref ? columnIndex(ref) : nextCol;
        nextCol = col + 1;
        if (col > IMPORT_MAX_COLS) {
          continue;
        }
        const type = cell.getAttribute("t");
        const raw = byTag(cell, "v")[0]?.textContent ?? "";
        let text: string;
        if (type === "s") {
          text = shared[Number(raw)] ?? "";
        } else if (type === "inlineStr") {
          const inline = byTag(cell, "is")[0];
          text = inline ? stringItemText(inline) : "";
        } else if (type === "b") {
          text = raw === "1" ? "TRUE" : "FALSE";
        } else if (type === "str" || type === "e" || type === "d") {
          text = raw;
        } else {
          text = formatNumber(
            raw,
            kinds[Number(cell.getAttribute("s") ?? 0)] ?? "plain",
            date1904,
          );
        }
        row[col] = text;
      }
    }
    sheets.push({
      name: node.getAttribute("name") ?? `Sheet ${index + 1}`,
      // rows the file skipped are holes in the array; make them empty rows
      rows: Array.from(rows, (row) => Array.from(row ?? [], (cell) => cell ?? "")),
    });
  }
  return sheets;
};

const parseOds = async (zip: JSZip): Promise<ImportedSheet[]> => {
  const contentXml = await readZipText(zip, "content.xml");
  if (!contentXml) {
    throw new Error("This file is not a valid OpenDocument spreadsheet.");
  }
  const repeat = (node: Element, attribute: string) =>
    Math.max(1, Number(node.getAttributeNS(node.namespaceURI, attribute) ?? 1) || 1);

  return byTag(parseXml(contentXml), "table").map((table, index) => {
    const rows: TableRows = [];
    for (const rowNode of byTag(table, "table-row")) {
      if (rows.length > IMPORT_MAX_ROWS) {
        break;
      }
      const row: string[] = [];
      for (const cell of Array.from(rowNode.children)) {
        if (
          cell.localName !== "table-cell" &&
          cell.localName !== "covered-table-cell"
        ) {
          continue;
        }
        const text = byTag(cell, "p")
          .map((paragraph) => paragraph.textContent ?? "")
          .join("\n");
        // empty cells are stored once with a repeat count that can run to the
        // sheet's full width, so only repeat as far as the import can use
        const times = Math.min(
          repeat(cell, "number-columns-repeated"),
          IMPORT_MAX_COLS + 1 - row.length,
        );
        for (let i = 0; i < times; i++) {
          row.push(text);
        }
      }
      const isEmpty = row.every((cell) => !cell);
      const times = Math.min(
        repeat(rowNode, "number-rows-repeated"),
        // a trailing run of blank rows is the unused rest of the sheet
        isEmpty ? 1 : IMPORT_MAX_ROWS + 1 - rows.length,
      );
      for (let i = 0; i < times; i++) {
        rows.push([...row]);
      }
    }
    return {
      name:
        table.getAttributeNS(table.namespaceURI, "name") ?? `Sheet ${index + 1}`,
      rows,
    };
  });
};

/** Encoding a legacy (non-Unicode) CSV most likely uses, by UI language. */
const legacyEncoding = () => {
  const language = (
    typeof navigator === "undefined" ? "" : navigator.language
  ).slice(0, 2);
  if (["pl", "cs", "sk", "hu", "sl", "hr", "ro"].includes(language)) {
    return "windows-1250";
  }
  if (["ru", "uk", "bg", "sr", "mk"].includes(language)) {
    return "windows-1251";
  }
  return "windows-1252";
};

/** Decode a text file: UTF-8 or UTF-16 if it is, else the local codepage. */
export const decodeText = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(legacyEncoding()).decode(bytes);
  }
};

export const TABLE_IMPORT_ACCEPT =
  ".csv,.tsv,.tab,.txt,.xlsx,.xlsm,.ods,text/csv,text/tab-separated-values,text/plain";

/**
 * Read a spreadsheet or delimited text file into sheets of rows. Text files
 * give a single sheet named after the file.
 */
export const readTableFile = async (file: File): Promise<ImportedSheet[]> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (isZip) {
    const zip = await JSZip.loadAsync(bytes);
    const sheets = zip.file("content.xml")
      ? await parseOds(zip)
      : await parseXlsx(zip);
    const filled = sheets.filter((sheet) =>
      sheet.rows.some((row) => row.some((cell) => cell)),
    );
    if (!filled.length) {
      throw new Error("This spreadsheet has no data in it.");
    }
    return filled;
  }
  if (extension === "xls" || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    throw new Error(
      "Old .xls files are not supported. Save it as .xlsx or .csv and try again.",
    );
  }
  const rows = parseDelimitedText(decodeText(bytes));
  if (!rows.length) {
    throw new Error("This file is empty.");
  }
  return [{ name: file.name, rows }];
};
