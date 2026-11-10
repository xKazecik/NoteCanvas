import { TABLE_DEFAULTS, emptyCell, getCell, tableColumnCount } from "./table";
import { tableFromRows } from "./tableData";
import { normalizeTable } from "./tableOps";

import type { CellRange } from "./tableData";
import type { CellPosition } from "./table";
import type { TablePatch } from "./tableOps";
import type {
  ExcalidrawTableElement,
  TableCell,
  TableCellStyle,
} from "./types";

/**
 * Tables copied from a spreadsheet (Excel, Google Sheets, LibreOffice) or a
 * web page arrive as HTML alongside the plain text. The HTML is what carries
 * the formatting: fills, text colour, font size, bold and italic, alignment,
 * merged cells, column widths and row heights.
 */
export type PastedTable = {
  /** Rectangular grid; merges are anchors with spans plus `spannedBy` slots. */
  cells: TableCell[][];
  /** Width of each column in px, where the source said. */
  colWidths: (number | null)[];
  /** Height of each row in px, where the source said. */
  rowHeights: (number | null)[];
};

const MAX_ROWS = 500;
const MAX_COLS = 50;
const MAX_SPAN = 50;

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

type Declarations = Record<string, string>;

const parseDeclarations = (text: string | null | undefined): Declarations => {
  const result: Declarations = {};
  for (const part of (text ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, "")
      .trim();
    if (name && value) {
      result[name] = value;
    }
  }
  return result;
};

/**
 * The rules of the document's style sheets that a table cell can match:
 * `td`, `.class`, `td.class`. Excel puts nearly all of a copied range's
 * formatting in classes like `.xl65`.
 */
const parseStyleSheets = (doc: Document) => {
  const rules = new Map<string, Declarations>();
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    const css = (style.textContent ?? "")
      .replace(/<!--|-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declarations = parseDeclarations(match[2]);
      for (const raw of match[1].split(",")) {
        const selector = raw.trim().toLowerCase();
        if (/^[a-z]*(\.[\w-]+)?$/.test(selector) && selector) {
          rules.set(selector, { ...rules.get(selector), ...declarations });
        }
      }
    }
  }
  return rules;
};

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  navy: "#000080",
  teal: "#008080",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  fuchsia: "#ff00ff",
};

const hex2 = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

/** A CSS colour as #rrggbb, or null when it is no colour (transparent, auto). */
export const cssColorToHex = (value: string | null | undefined) => {
  const color = (value ?? "").trim().toLowerCase();
  let match = color.match(/^#([0-9a-f]{3})$/);
  if (match) {
    return `#${[...match[1]].map((digit) => digit + digit).join("")}`;
  }
  match = color.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (match) {
    return match[2] === "00" ? null : `#${match[1]}`;
  }
  match = color.match(/^rgba?\(([^)]+)\)$/);
  if (match) {
    const [r, g, b, a] = match[1].split(/[\s,/]+/).map(parseFloat);
    if (a === 0 || [r, g, b].some(Number.isNaN)) {
      return null;
    }
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
  return NAMED_COLORS[color] ?? null;
};

/** The first colour in a value like `#C00000 none` or `url(x) red`. */
const findColor = (value: string | undefined) => {
  for (const token of (value ?? "").match(/#[0-9a-f]+|rgba?\([^)]*\)|[a-z]+/gi) ??
    []) {
    const color = cssColorToHex(token);
    if (color) {
      return color;
    }
  }
  return null;
};

/** A length in px; `pt` is what Excel and Google Sheets use. */
const lengthToPx = (value: string | null | undefined): number | null => {
  const match = (value ?? "").trim().match(/^(-?[\d.]+)\s*(px|pt|in|cm|mm)?$/i);
  if (!match) {
    return null;
  }
  const number = parseFloat(match[1]);
  const unit = (match[2] ?? "px").toLowerCase();
  const px =
    unit === "pt"
      ? (number * 96) / 72
      : unit === "in"
      ? number * 96
      : unit === "cm"
      ? (number * 96) / 2.54
      : unit === "mm"
      ? (number * 96) / 25.4
      : number;
  return Number.isFinite(px) && px > 0 ? Math.round(px * 100) / 100 : null;
};

/** `<font size=N>`, the way LibreOffice writes font sizes. */
const LEGACY_FONT_SIZES = [10, 13, 16, 18, 24, 32, 48];

const applyDeclarations = (style: TableCellStyle, css: Declarations) => {
  const background = findColor(css["background-color"] ?? css.background);
  if (css["background-color"] !== undefined || css.background !== undefined) {
    if (background) {
      style.backgroundColor = background;
    } else {
      delete style.backgroundColor;
    }
  }
  if (css.color !== undefined) {
    const color = cssColorToHex(css.color);
    // black is everyone's default; leaving it out lets the cell follow the
    // table's own text colour
    if (color && color !== "#000000") {
      style.textColor = color;
    } else {
      delete style.textColor;
    }
  }
  const size = lengthToPx(css["font-size"]);
  if (size) {
    style.fontSize = size;
  }
  const weight = css["font-weight"];
  if (weight) {
    style.bold = weight === "bold" || weight === "bolder" || parseInt(weight) >= 600;
  }
  const fontStyle = css["font-style"];
  if (fontStyle) {
    style.italic = fontStyle === "italic" || fontStyle === "oblique";
  }
  const align = css["text-align"];
  if (align === "left" || align === "center" || align === "right") {
    style.textAlign = align;
  } else if (align === "start" || align === "justify") {
    style.textAlign = "left";
  } else if (align === "end") {
    style.textAlign = "right";
  }
  const valign = css["vertical-align"];
  if (valign === "top" || valign === "bottom") {
    style.verticalAlign = valign;
  } else if (valign === "middle") {
    style.verticalAlign = "middle";
  }
};

/** Formatting set with tags and attributes rather than CSS. */
const applyLegacyMarkup = (style: TableCellStyle, element: Element) => {
  const tag = element.localName;
  if (tag === "b" || tag === "strong") {
    style.bold = true;
  }
  if (tag === "i" || tag === "em") {
    style.italic = true;
  }
  if (tag === "font") {
    const color = cssColorToHex(element.getAttribute("color"));
    if (color && color !== "#000000") {
      style.textColor = color;
    }
    const size = parseInt(element.getAttribute("size") ?? "", 10);
    if (size >= 1 && size <= 7) {
      style.fontSize = LEGACY_FONT_SIZES[size - 1];
    }
  }
  const bgcolor = cssColorToHex(element.getAttribute("bgcolor"));
  if (bgcolor) {
    style.backgroundColor = bgcolor;
  }
  const align = element.getAttribute("align")?.toLowerCase();
  if (align === "left" || align === "center" || align === "right") {
    style.textAlign = align;
  }
  const valign = element.getAttribute("valign")?.toLowerCase();
  if (valign === "top" || valign === "bottom" || valign === "middle") {
    style.verticalAlign = valign;
  }
};

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** A cell's text as it reads: line breaks kept, layout whitespace collapsed. */
const cellText = (cell: Element): string => {
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      text += (node.textContent ?? "").replace(/[\t\r\n ]+/g, " ");
    } else if (node.nodeType === 1) {
      const element = node as Element;
      if (element.localName === "br") {
        text += "\n";
        return;
      }
      const isBlock = /^(p|div|li|h[1-6])$/.test(element.localName);
      if (isBlock && text && !text.endsWith("\n")) {
        text += "\n";
      }
      element.childNodes.forEach(walk);
      if (isBlock && !text.endsWith("\n")) {
        text += "\n";
      }
    }
  };
  cell.childNodes.forEach(walk);
  return text
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
};

/**
 * The wrappers that hold all of a cell's text, outermost first -- the
 * `<b><font>` or `<span style>` that formatting is often set on instead of
 * on the cell itself.
 */
const textWrappers = (cell: Element): Element[] => {
  const wrappers: Element[] = [];
  const all = (cell.textContent ?? "").trim();
  let current: Element = cell;
  while (all) {
    const children = Array.from(current.children).filter(
      (child) => child.localName !== "br",
    );
    const holder = children.find(
      (child) => (child.textContent ?? "").trim() === all,
    );
    if (!holder) {
      break;
    }
    wrappers.push(holder);
    current = holder;
  }
  return wrappers;
};

const resolveCellStyle = (
  cell: Element,
  rules: Map<string, Declarations>,
): TableCellStyle => {
  const style: TableCellStyle = {};
  const tag = cell.localName;
  if (tag === "th") {
    style.bold = true;
  }
  const classes = (cell.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => name.toLowerCase());
  const sources = [
    rules.get(tag),
    ...classes.flatMap((name) => [rules.get(`.${name}`), rules.get(`${tag}.${name}`)]),
  ];
  for (const css of sources) {
    if (css) {
      applyDeclarations(style, css);
    }
  }
  applyLegacyMarkup(style, cell);
  applyDeclarations(style, parseDeclarations(cell.getAttribute("style")));
  for (const wrapper of textWrappers(cell)) {
    applyLegacyMarkup(style, wrapper);
    for (const name of (wrapper.getAttribute("class") ?? "").split(/\s+/)) {
      const css = name && rules.get(`.${name.toLowerCase()}`);
      if (css) {
        applyDeclarations(style, css);
      }
    }
    applyDeclarations(style, parseDeclarations(wrapper.getAttribute("style")));
  }
  // `bold: false` is how a th is turned back to normal; anywhere else it is
  // the default, and an empty style keeps the cell free of overrides
  if (style.bold === false && tag !== "th") {
    delete style.bold;
  }
  if (style.italic === false) {
    delete style.italic;
  }
  return style;
};

const columnWidths = (table: HTMLTableElement): (number | null)[] => {
  const widths: (number | null)[] = [];
  for (const col of Array.from(table.querySelectorAll("col"))) {
    if (col.closest("table") !== table) {
      continue;
    }
    const width =
      lengthToPx(col.getAttribute("width")) ??
      lengthToPx(parseDeclarations(col.getAttribute("style")).width);
    const span = Math.min(
      MAX_COLS,
      Math.max(1, parseInt(col.getAttribute("span") ?? "1", 10) || 1),
    );
    for (let i = 0; i < span; i++) {
      widths.push(width);
    }
  }
  return widths;
};

/**
 * Read the table out of clipboard HTML. Returns null when the HTML is not
 * essentially one table -- a web page fragment with a table somewhere in it
 * is better pasted the way it always was.
 */
export const parseHTMLTable = (html: string): PastedTable | null => {
  if (!html || !/<table[\s>]/i.test(html)) {
    return null;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) {
    return null;
  }
  // read the style sheets first: Google Sheets puts its <style> inside the
  // body, where its text would otherwise count as content around the table
  const rules = parseStyleSheets(doc);
  doc
    .querySelectorAll("style, script, meta, title")
    .forEach((node) => node.remove());
  const allText = (doc.body.textContent ?? "").replace(/\s+/g, "");
  const tableText = (table.textContent ?? "").replace(/\s+/g, "");
  if (allText.length && tableText.length < allText.length * 0.9) {
    return null;
  }
  const rows = Array.from(table.rows).slice(0, MAX_ROWS);
  // which slots are taken by a cell above reaching down (rowspan)
  const taken: boolean[][] = rows.map(() => []);
  const anchors: {
    row: number;
    col: number;
    cell: TableCell;
  }[] = [];
  const rowHeights: (number | null)[] = [];
  let cols = 0;

  rows.forEach((tr, row) => {
    rowHeights.push(
      lengthToPx(tr.getAttribute("height")) ??
        lengthToPx(parseDeclarations(tr.getAttribute("style")).height),
    );
    let col = 0;
    for (const td of Array.from(tr.cells)) {
      while (taken[row][col]) {
        col++;
      }
      if (col >= MAX_COLS) {
        break;
      }
      const colSpan = Math.min(MAX_SPAN, Math.max(1, td.colSpan || 1));
      const rowSpan = Math.min(MAX_SPAN, Math.max(1, td.rowSpan || 1));
      const style = resolveCellStyle(td, rules);
      const cell: TableCell = {
        text: cellText(td),
        ...(Object.keys(style).length ? { style } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
      };
      anchors.push({ row, col, cell });
      for (let r = row; r < Math.min(rows.length, row + rowSpan); r++) {
        for (let c = col; c < Math.min(MAX_COLS, col + colSpan); c++) {
          taken[r][c] = true;
        }
      }
      col += colSpan;
      cols = Math.max(cols, Math.min(MAX_COLS, col));
    }
  });

  if (!rows.length || !cols) {
    return null;
  }

  const cells: TableCell[][] = rows.map(() =>
    Array.from({ length: cols }, () => emptyCell()),
  );
  for (const { row, col, cell } of anchors) {
    cells[row][col] = cell;
  }
  const widths = columnWidths(table);
  return {
    // spans are clamped to the grid and their slots filled in here
    cells: normalizeTable({
      colWidths: Array.from({ length: cols }, () => TABLE_DEFAULTS.colWidth),
      rowHeights: rows.map(() => TABLE_DEFAULTS.rowHeight),
      cells,
    }).cells.map((row) => [...row]),
    colWidths: Array.from({ length: cols }, (_, col) => widths[col] ?? null),
    rowHeights,
  };
};

/** How many cells a pasted table has, merged cells counting once. */
export const pastedCellCount = (pasted: PastedTable) =>
  pasted.cells.reduce(
    (count, row) => count + row.filter((cell) => !cell.spannedBy).length,
    0,
  );

/**
 * Track sizes for a table made from a paste: the source's own column widths
 * and row heights where it gave them, sized to the text where it did not.
 */
export const tableLayoutFromPaste = (
  pasted: PastedTable,
): Pick<ExcalidrawTableElement, "colWidths" | "rowHeights" | "cells"> => {
  const measured = tableFromRows(
    pasted.cells.map((row) =>
      row.map((cell) => (cell.spannedBy || (cell.colSpan ?? 1) > 1 ? "" : cell.text)),
    ),
  );
  return {
    colWidths: measured.colWidths.map((width, col) =>
      Math.max(
        TABLE_DEFAULTS.minColWidth,
        pasted.colWidths[col] ?? width,
      ),
    ),
    rowHeights: measured.rowHeights.map((height, row) =>
      Math.max(
        TABLE_DEFAULTS.minRowHeight,
        pasted.rowHeights[row] ?? height,
      ),
    ),
    cells: pasted.cells,
  };
};

/**
 * Write a pasted table into an existing one at `at`, formatting and merges
 * included, growing the table where the paste runs past its edge. Existing
 * merges the paste lands on are undone first, as a spreadsheet does; the
 * table keeps its own column widths and row heights.
 */
export const fillCellsFromPaste = (
  element: ExcalidrawTableElement,
  at: CellPosition,
  pasted: PastedTable,
): TablePatch => {
  const pastedRows = pasted.cells.length;
  const pastedCols = pasted.cells[0]?.length ?? 0;
  const rows = Math.max(element.rowHeights.length, at.row + pastedRows);
  const cols = Math.max(tableColumnCount(element), at.col + pastedCols);

  const colWidths = [...element.colWidths];
  while (colWidths.length < cols) {
    colWidths.push(
      pasted.colWidths[colWidths.length - at.col] ??
        colWidths[colWidths.length - 1] ??
        TABLE_DEFAULTS.colWidth,
    );
  }
  const rowHeights = [...element.rowHeights];
  while (rowHeights.length < rows) {
    rowHeights.push(rowHeights[rowHeights.length - 1] ?? TABLE_DEFAULTS.rowHeight);
  }

  const cells: TableCell[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (__, col) => {
      const cell = element.cells[row]?.[col];
      return cell ? { ...cell } : emptyCell();
    }),
  );

  const target: CellRange = {
    top: at.row,
    left: at.col,
    bottom: at.row + pastedRows - 1,
    right: at.col + pastedCols - 1,
  };
  // undo every existing merge that overlaps where the paste goes
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = cells[row][col];
      const bottom = row + (cell.rowSpan ?? 1) - 1;
      const right = col + (cell.colSpan ?? 1) - 1;
      if (
        !cell.spannedBy &&
        (bottom > row || right > col) &&
        row <= target.bottom &&
        bottom >= target.top &&
        col <= target.right &&
        right >= target.left
      ) {
        delete cell.colSpan;
        delete cell.rowSpan;
      }
    }
  }

  pasted.cells.forEach((line, r) =>
    line.forEach((source, c) => {
      const { spannedBy: _spannedBy, ...rest } = source;
      cells[at.row + r][at.col + c] = source.spannedBy
        ? emptyCell()
        : { ...rest };
    }),
  );

  return normalizeTable({ colWidths, rowHeights, cells });
};

// ---------------------------------------------------------------------------
// Copying out
// ---------------------------------------------------------------------------

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;",
  );

const styleToCss = (style: TableCellStyle | undefined) => {
  if (!style) {
    return "";
  }
  const css: string[] = [];
  if (style.backgroundColor && style.backgroundColor !== "transparent") {
    css.push(`background-color:${style.backgroundColor}`);
  }
  if (style.textColor) {
    css.push(`color:${style.textColor}`);
  }
  if (style.fontSize) {
    css.push(`font-size:${style.fontSize}px`);
  }
  if (style.bold !== undefined) {
    css.push(`font-weight:${style.bold ? "bold" : "normal"}`);
  }
  if (style.italic) {
    css.push("font-style:italic");
  }
  if (style.textAlign) {
    css.push(`text-align:${style.textAlign}`);
  }
  if (style.verticalAlign) {
    css.push(`vertical-align:${style.verticalAlign}`);
  }
  return css.join(";");
};

/**
 * A range of a table as an HTML table, formatting and merges included, for
 * the clipboard: spreadsheets read it as formatted cells, and pasting it back
 * onto the canvas brings the formatting along.
 */
export const rangeToHTML = (
  element: ExcalidrawTableElement,
  range: CellRange,
): string => {
  const colgroup = element.colWidths
    .slice(range.left, range.right + 1)
    .map((width) => `<col width="${Math.round(width)}">`)
    .join("");
  const rows: string[] = [];
  for (let row = range.top; row <= range.bottom; row++) {
    const cells: string[] = [];
    for (let col = range.left; col <= range.right; col++) {
      const cell = getCell(element, row, col);
      if (!cell || cell.spannedBy) {
        continue;
      }
      const colSpan = Math.min(cell.colSpan ?? 1, range.right - col + 1);
      const rowSpan = Math.min(cell.rowSpan ?? 1, range.bottom - row + 1);
      const css = styleToCss(cell.style);
      cells.push(
        `<td${colSpan > 1 ? ` colspan="${colSpan}"` : ""}${
          rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""
        }${css ? ` style="${css}"` : ""}>${escapeHtml(cell.text).replace(
          /\n/g,
          "<br>",
        )}</td>`,
      );
    }
    rows.push(
      `<tr style="height:${Math.round(element.rowHeights[row])}px">${cells.join(
        "",
      )}</tr>`,
    );
  }
  return `<table><colgroup>${colgroup}</colgroup><tbody>${rows.join(
    "",
  )}</tbody></table>`;
};
