import {
  TABLE_DEFAULTS,
  emptyCell,
  getCell,
  tableColumnCount,
  tableHeight,
  tableRowCount,
  tableWidth,
} from "./table";

import type { TablePatch } from "./tableOps";
import type { CellPosition } from "./table";
import type { ExcalidrawTableElement, TableCell } from "./types";

/** An inclusive rectangle of grid slots. */
export type CellRange = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

const inRange = (range: CellRange, row: number, col: number) =>
  row >= range.top &&
  row <= range.bottom &&
  col >= range.left &&
  col <= range.right;

/**
 * Parse tab-separated text the way spreadsheets put it on the clipboard: rows
 * split on newlines, cells on tabs, and a cell wrapped in double quotes may
 * contain either (with `""` standing for a literal quote).
 */
export const parseTSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const source = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
};

const quoteTSV = (text: string) =>
  /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

/** The text of a range as TSV, so it pastes into a spreadsheet as cells. */
export const rangeToTSV = (
  element: ExcalidrawTableElement,
  range: CellRange,
): string => {
  const lines: string[] = [];
  for (let row = range.top; row <= range.bottom; row++) {
    const values: string[] = [];
    for (let col = range.left; col <= range.right; col++) {
      values.push(quoteTSV(getCell(element, row, col)?.text ?? ""));
    }
    lines.push(values.join("\t"));
  }
  return lines.join("\n");
};

/** Empty the text of every cell in a range, keeping its formatting. */
export const clearCells = (
  element: ExcalidrawTableElement,
  range: CellRange,
): Pick<ExcalidrawTableElement, "cells"> => ({
  cells: element.cells.map((cells, row) =>
    cells.map((cell, col) =>
      inRange(range, row, col) && cell.text ? { ...cell, text: "" } : cell,
    ),
  ),
});

/**
 * Write a block of values into the grid starting at `at`, adding rows and
 * columns when the block runs past the edge. Values that land on a slot hidden
 * by a merge are dropped, since that slot has no text of its own.
 */
export const fillCells = (
  element: ExcalidrawTableElement,
  at: CellPosition,
  values: readonly (readonly string[])[],
): TablePatch => {
  const blockCols = Math.max(0, ...values.map((line) => line.length));
  const rows = Math.max(tableRowCount(element), at.row + values.length);
  const cols = Math.max(tableColumnCount(element), at.col + blockCols);

  const colWidths = [...element.colWidths];
  while (colWidths.length < cols) {
    colWidths.push(colWidths[colWidths.length - 1] ?? TABLE_DEFAULTS.colWidth);
  }
  const rowHeights = [...element.rowHeights];
  while (rowHeights.length < rows) {
    rowHeights.push(
      rowHeights[rowHeights.length - 1] ?? TABLE_DEFAULTS.rowHeight,
    );
  }

  const cells: TableCell[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (__, col) => {
      const cell = element.cells[row]?.[col];
      return cell ? { ...cell } : emptyCell();
    }),
  );

  values.forEach((line, r) =>
    line.forEach((text, c) => {
      const cell = cells[at.row + r][at.col + c];
      if (!cell.spannedBy) {
        cell.text = text;
      }
    }),
  );

  return {
    colWidths,
    rowHeights,
    cells,
    width: tableWidth(colWidths),
    height: tableHeight(rowHeights),
  };
};

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Reorder the body rows by the text in one column. The header row stays on
 * top, empty cells sink to the bottom whichever way the sort runs, and each
 * row keeps its own height. Merges in the body store row indices that a
 * reorder would invalidate, so that case is refused rather than mangled.
 */
export const sortRowsByColumn = (
  element: ExcalidrawTableElement,
  col: number,
  direction: "asc" | "desc",
): Pick<ExcalidrawTableElement, "cells" | "rowHeights"> | null => {
  const first = element.headerRow ? 1 : 0;
  const body = element.cells.slice(first);
  if (
    body.length < 2 ||
    body.some((cells) =>
      cells.some(
        (cell) =>
          cell.spannedBy ||
          (cell.rowSpan ?? 1) > 1 ||
          (cell.colSpan ?? 1) > 1,
      ),
    )
  ) {
    return null;
  }

  const order = body
    .map((cells, index) => ({ cells, index }))
    .sort((a, b) => {
      const textA = a.cells[col]?.text.trim() ?? "";
      const textB = b.cells[col]?.text.trim() ?? "";
      if (!textA || !textB) {
        return (textA ? 0 : 1) - (textB ? 0 : 1) || a.index - b.index;
      }
      const result = collator.compare(textA, textB);
      return (direction === "asc" ? result : -result) || a.index - b.index;
    });

  return {
    cells: [...element.cells.slice(0, first), ...order.map((row) => row.cells)],
    rowHeights: [
      ...element.rowHeights.slice(0, first),
      ...order.map((row) => element.rowHeights[row.index + first]),
    ],
  };
};
