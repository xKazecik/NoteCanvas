import {
  TABLE_DEFAULTS,
  emptyCell,
  getCell,
  tableColumnCount,
  tableHeight,
  tableRowCount,
  tableWidth,
} from "./table";

import type { CellPosition } from "./table";
import type { ExcalidrawTableElement, TableCell } from "./types";

/** The mutable slice of a table produced by every structural operation. */
export type TablePatch = Pick<
  ExcalidrawTableElement,
  "colWidths" | "rowHeights" | "cells" | "width" | "height"
>;

type Grid = TableCell[][];

const cloneGrid = (element: ExcalidrawTableElement): Grid =>
  element.cells.map((row) => row.map((cell) => ({ ...cell })));

const patch = (
  colWidths: number[],
  rowHeights: number[],
  cells: Grid,
): TablePatch => ({
  colWidths,
  rowHeights,
  cells,
  width: tableWidth(colWidths),
  height: tableHeight(rowHeights),
});

/**
 * Rebuild every spannedBy pointer from the surviving anchors. Structural edits
 * shift indices around, so rather than patching each pointer we clear them all
 * and re-derive from the spans, trimming any span that now runs off the grid.
 */
const reindexSpans = (cells: Grid): Grid => {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  for (const row of cells) {
    for (const cell of row) {
      delete cell.spannedBy;
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = cells[row][col];
      if (cell.spannedBy) {
        continue;
      }
      const colSpan = Math.min(cell.colSpan ?? 1, cols - col);
      const rowSpan = Math.min(cell.rowSpan ?? 1, rows - row);

      if (colSpan > 1) {
        cell.colSpan = colSpan;
      } else {
        delete cell.colSpan;
      }
      if (rowSpan > 1) {
        cell.rowSpan = rowSpan;
      } else {
        delete cell.rowSpan;
      }

      for (let r = row; r < row + rowSpan; r++) {
        for (let c = col; c < col + colSpan; c++) {
          if (r !== row || c !== col) {
            cells[r][c] = { text: "", spannedBy: { row, col } };
          }
        }
      }
    }
  }
  return cells;
};

/**
 * Split any merge that straddles the given track index. Inserting or removing a
 * track inside a merged region has no sensible meaning, so we unmerge first.
 */
const splitSpansAcross = (cells: Grid, axis: "row" | "col", index: number) => {
  for (let row = 0; row < cells.length; row++) {
    for (let col = 0; col < cells[row].length; col++) {
      const cell = cells[row][col];
      if (cell.spannedBy) {
        continue;
      }
      const start = axis === "col" ? col : row;
      const span = axis === "col" ? cell.colSpan ?? 1 : cell.rowSpan ?? 1;
      if (span > 1 && index > start && index < start + span) {
        delete cell.colSpan;
        delete cell.rowSpan;
      }
    }
  }
};

export const insertRow = (
  element: ExcalidrawTableElement,
  at: number,
): TablePatch => {
  const cells = cloneGrid(element);
  splitSpansAcross(cells, "row", at);
  const cols = tableColumnCount(element);
  cells.splice(
    at,
    0,
    Array.from({ length: cols }, () => emptyCell()),
  );
  const rowHeights = [...element.rowHeights];
  const template =
    rowHeights[Math.min(at, rowHeights.length - 1)] ?? TABLE_DEFAULTS.rowHeight;
  rowHeights.splice(at, 0, template);
  return patch([...element.colWidths], rowHeights, reindexSpans(cells));
};

export const insertColumn = (
  element: ExcalidrawTableElement,
  at: number,
): TablePatch => {
  const cells = cloneGrid(element);
  splitSpansAcross(cells, "col", at);
  for (const row of cells) {
    row.splice(at, 0, emptyCell());
  }
  const colWidths = [...element.colWidths];
  const template =
    colWidths[Math.min(at, colWidths.length - 1)] ?? TABLE_DEFAULTS.colWidth;
  colWidths.splice(at, 0, template);
  return patch(colWidths, [...element.rowHeights], reindexSpans(cells));
};

/** Remove `count` rows starting at `at`; the last row can never be removed. */
export const deleteRow = (
  element: ExcalidrawTableElement,
  at: number,
  count = 1,
): TablePatch | null => {
  if (tableRowCount(element) <= count) {
    return null;
  }
  const cells = cloneGrid(element);
  splitSpansAcross(cells, "row", at);
  splitSpansAcross(cells, "row", at + count);
  cells.splice(at, count);
  const rowHeights = [...element.rowHeights];
  rowHeights.splice(at, count);
  return patch([...element.colWidths], rowHeights, reindexSpans(cells));
};

/** Remove `count` columns starting at `at`; the last column always stays. */
export const deleteColumn = (
  element: ExcalidrawTableElement,
  at: number,
  count = 1,
): TablePatch | null => {
  if (tableColumnCount(element) <= count) {
    return null;
  }
  const cells = cloneGrid(element);
  splitSpansAcross(cells, "col", at);
  splitSpansAcross(cells, "col", at + count);
  for (const row of cells) {
    row.splice(at, count);
  }
  const colWidths = [...element.colWidths];
  colWidths.splice(at, count);
  return patch(colWidths, [...element.rowHeights], reindexSpans(cells));
};

/** Resize one column, leaving every other column untouched. */
export const setColumnWidth = (
  element: ExcalidrawTableElement,
  index: number,
  width: number,
): TablePatch => {
  const colWidths = [...element.colWidths];
  colWidths[index] = Math.max(TABLE_DEFAULTS.minColWidth, width);
  return patch(colWidths, [...element.rowHeights], cloneGrid(element));
};

/** Resize one row, leaving every other row untouched. */
export const setRowHeight = (
  element: ExcalidrawTableElement,
  index: number,
  height: number,
): TablePatch => {
  const rowHeights = [...element.rowHeights];
  rowHeights[index] = Math.max(TABLE_DEFAULTS.minRowHeight, height);
  return patch([...element.colWidths], rowHeights, cloneGrid(element));
};

/**
 * Scale all tracks so the table fills a new outer size. This is what the normal
 * element resize handles drive, and it is what makes a table reflow rather than
 * stretch like a bitmap.
 */
export const scaleTableTo = (
  element: ExcalidrawTableElement,
  width: number,
  height: number,
): TablePatch => {
  const scaleTrack = (
    sizes: readonly number[],
    target: number,
    min: number,
  ) => {
    const current = sizes.reduce((sum, size) => sum + size, 0);
    const ratio = current > 0 ? target / current : 1;
    return sizes.map((size) => Math.max(min, size * ratio));
  };
  return patch(
    scaleTrack(element.colWidths, width, TABLE_DEFAULTS.minColWidth),
    scaleTrack(element.rowHeights, height, TABLE_DEFAULTS.minRowHeight),
    cloneGrid(element),
  );
};

/** The rectangular hull of a selection, grown to swallow partial merges. */
export const normalizeRange = (
  element: ExcalidrawTableElement,
  a: CellPosition,
  b: CellPosition,
): { top: number; left: number; bottom: number; right: number } => {
  let top = Math.min(a.row, b.row);
  let left = Math.min(a.col, b.col);
  let bottom = Math.max(a.row, b.row);
  let right = Math.max(a.col, b.col);

  let grew = true;
  while (grew) {
    grew = false;
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const cell = getCell(element, row, col);
        if (!cell) {
          continue;
        }
        const anchor = cell.spannedBy ?? { row, col };
        const anchorCell = getCell(element, anchor.row, anchor.col);
        const endRow = anchor.row + ((anchorCell?.rowSpan ?? 1) - 1);
        const endCol = anchor.col + ((anchorCell?.colSpan ?? 1) - 1);
        if (anchor.row < top) {
          top = anchor.row;
          grew = true;
        }
        if (anchor.col < left) {
          left = anchor.col;
          grew = true;
        }
        if (endRow > bottom) {
          bottom = endRow;
          grew = true;
        }
        if (endCol > right) {
          right = endCol;
          grew = true;
        }
      }
    }
  }
  return { top, left, bottom, right };
};

/** Merge a range into its top-left cell, concatenating any non-empty text. */
export const mergeCells = (
  element: ExcalidrawTableElement,
  a: CellPosition,
  b: CellPosition,
): TablePatch | null => {
  const { top, left, bottom, right } = normalizeRange(element, a, b);
  if (top === bottom && left === right) {
    return null;
  }
  const cells = cloneGrid(element);
  const texts: string[] = [];
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const text = cells[row][col].text.trim();
      if (text) {
        texts.push(text);
      }
    }
  }
  const anchor = cells[top][left];
  anchor.text = texts.join(" ");
  anchor.colSpan = right - left + 1;
  anchor.rowSpan = bottom - top + 1;
  return patch(
    [...element.colWidths],
    [...element.rowHeights],
    reindexSpans(cells),
  );
};

/** Undo a merge, leaving the text in the anchor cell. */
export const unmergeCells = (
  element: ExcalidrawTableElement,
  at: CellPosition,
): TablePatch | null => {
  const cell = getCell(element, at.row, at.col);
  const anchor = cell?.spannedBy ?? at;
  const anchorCell = getCell(element, anchor.row, anchor.col);
  if (
    !anchorCell ||
    ((anchorCell.colSpan ?? 1) <= 1 && (anchorCell.rowSpan ?? 1) <= 1)
  ) {
    return null;
  }
  const cells = cloneGrid(element);
  delete cells[anchor.row][anchor.col].colSpan;
  delete cells[anchor.row][anchor.col].rowSpan;
  return patch(
    [...element.colWidths],
    [...element.rowHeights],
    reindexSpans(cells),
  );
};

/**
 * Coerce a possibly-malformed table back into a consistent shape. Scenes can
 * arrive from older versions, hand-edited files or a peer running different
 * code, so restore leans on this rather than trusting the payload: track sizes
 * must be positive numbers, the grid must match the track counts, spans must
 * point at real anchors, and width/height must equal the track sums.
 */
export const normalizeTable = (
  table: Partial<ExcalidrawTableElement>,
): TablePatch => {
  const sanitizeTrack = (
    sizes: unknown,
    fallbackCount: number,
    fallbackSize: number,
    min: number,
  ): number[] => {
    const list = Array.isArray(sizes) ? sizes : [];
    const cleaned = list
      .map((size) => (typeof size === "number" && Number.isFinite(size) ? size : fallbackSize))
      .map((size) => Math.max(min, size));
    return cleaned.length > 0
      ? cleaned
      : Array.from({ length: fallbackCount }, () => fallbackSize);
  };

  const colWidths = sanitizeTrack(
    table.colWidths,
    TABLE_DEFAULTS.cols,
    TABLE_DEFAULTS.colWidth,
    TABLE_DEFAULTS.minColWidth,
  );
  const rowHeights = sanitizeTrack(
    table.rowHeights,
    TABLE_DEFAULTS.rows,
    TABLE_DEFAULTS.rowHeight,
    TABLE_DEFAULTS.minRowHeight,
  );

  const source = Array.isArray(table.cells) ? table.cells : [];
  const cells: Grid = rowHeights.map((_, row) =>
    colWidths.map((__, col) => {
      const cell = source[row]?.[col];
      if (!cell || typeof cell !== "object") {
        return emptyCell();
      }
      return {
        ...cell,
        text: typeof cell.text === "string" ? cell.text : "",
      };
    }),
  );

  return patch(colWidths, rowHeights, reindexSpans(cells));
};
