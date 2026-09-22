import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  TEXT_ALIGN,
  VERTICAL_ALIGN,
} from "@excalidraw/common";

import type {
  ExcalidrawTableElement,
  TableCell,
  TableCellStyle,
  TextAlign,
  VerticalAlign,
} from "./types";

export const TABLE_DEFAULTS = {
  colWidth: 120,
  rowHeight: 40,
  minColWidth: 24,
  minRowHeight: 20,
  cols: 3,
  rows: 3,
  /** Padding between a cell's border and its text, in scene units. */
  cellPadding: 6,
} as const;

/** A single cell's slot in the grid, in scene units relative to the element. */
export type CellBox = {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CellPosition = { row: number; col: number };

export const emptyCell = (): TableCell => ({ text: "" });

/** Running offsets for a track list: [0, w0, w0+w1, ...]. */
const offsets = (sizes: readonly number[]): number[] => {
  const out = [0];
  for (const size of sizes) {
    out.push(out[out.length - 1] + size);
  }
  return out;
};

export const columnOffsets = (element: ExcalidrawTableElement): number[] =>
  offsets(element.colWidths);

export const rowOffsets = (element: ExcalidrawTableElement): number[] =>
  offsets(element.rowHeights);

export const tableColumnCount = (element: ExcalidrawTableElement): number =>
  element.colWidths.length;

export const tableRowCount = (element: ExcalidrawTableElement): number =>
  element.rowHeights.length;

export const getCell = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
): TableCell | null => element.cells[row]?.[col] ?? null;

/** True when the cell is hidden behind a neighbour's row/col span. */
export const isSpannedCell = (cell: TableCell | null): boolean =>
  !!cell?.spannedBy;

/**
 * The cell that actually owns a grid slot: either the slot itself, or the
 * merged cell covering it.
 */
export const resolveAnchorCell = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
): CellPosition | null => {
  const cell = getCell(element, row, col);
  if (!cell) {
    return null;
  }
  if (cell.spannedBy) {
    const { row: r, col: c } = cell.spannedBy;
    return getCell(element, r, c) ? { row: r, col: c } : null;
  }
  return { row, col };
};

/**
 * The box a cell occupies, accounting for merges. Returns null for slots that
 * are swallowed by a merge, since those are never drawn.
 */
export const getCellBox = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
): CellBox | null => {
  const cell = getCell(element, row, col);
  if (!cell || cell.spannedBy) {
    return null;
  }
  const xs = columnOffsets(element);
  const ys = rowOffsets(element);
  const colSpan = Math.min(
    cell.colSpan ?? 1,
    tableColumnCount(element) - col,
  );
  const rowSpan = Math.min(cell.rowSpan ?? 1, tableRowCount(element) - row);
  return {
    row,
    col,
    x: xs[col],
    y: ys[row],
    width: xs[col + colSpan] - xs[col],
    height: ys[row + rowSpan] - ys[row],
  };
};

/** Every drawable cell box, skipping slots hidden by merges. */
export const getCellBoxes = (element: ExcalidrawTableElement): CellBox[] => {
  const boxes: CellBox[] = [];
  for (let row = 0; row < tableRowCount(element); row++) {
    for (let col = 0; col < tableColumnCount(element); col++) {
      const box = getCellBox(element, row, col);
      if (box) {
        boxes.push(box);
      }
    }
  }
  return boxes;
};

/** Index of the track (row or column) containing `value`, clamped to range. */
const trackAt = (trackOffsets: number[], value: number): number => {
  for (let i = 1; i < trackOffsets.length; i++) {
    if (value <= trackOffsets[i]) {
      return i - 1;
    }
  }
  return trackOffsets.length - 2;
};

/**
 * Which cell a point lands in. `x`/`y` are relative to the table's unrotated
 * top-left corner. Returns the merge anchor, so callers always get an editable
 * cell.
 */
export const getCellAtLocalPoint = (
  element: ExcalidrawTableElement,
  x: number,
  y: number,
): CellPosition | null => {
  const xs = columnOffsets(element);
  const ys = rowOffsets(element);
  if (x < 0 || y < 0 || x > xs[xs.length - 1] || y > ys[ys.length - 1]) {
    return null;
  }
  return resolveAnchorCell(
    element,
    trackAt(ys, y),
    trackAt(xs, x),
  );
};

/** Resolved styling for one cell, after table-level defaults are applied. */
export type ResolvedCellStyle = Required<
  Pick<
    TableCellStyle,
    "fontSize" | "fontFamily" | "bold" | "italic" | "textAlign" | "verticalAlign"
  >
> & {
  backgroundColor: string | null;
  textColor: string;
};

/**
 * Cell style precedence: explicit per-cell style, then header/banding, then the
 * element's own text colour and the engine defaults.
 */
export const resolveCellStyle = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
  options: { bandingColor: string; headerColor: string },
): ResolvedCellStyle => {
  const style = getCell(element, row, col)?.style ?? {};
  const isHeader = element.headerRow && row === 0;
  const isBanded =
    element.bandedRows && !isHeader && (row - (element.headerRow ? 1 : 0)) % 2 === 1;

  let backgroundColor: string | null = null;
  if (isHeader) {
    backgroundColor = options.headerColor;
  } else if (isBanded) {
    backgroundColor = options.bandingColor;
  }
  if (style.backgroundColor) {
    backgroundColor = style.backgroundColor;
  }

  return {
    backgroundColor:
      backgroundColor === "transparent" ? null : backgroundColor,
    textColor: style.textColor ?? element.strokeColor,
    fontSize: style.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: style.fontFamily ?? DEFAULT_FONT_FAMILY,
    bold: style.bold ?? isHeader,
    italic: style.italic ?? false,
    textAlign: style.textAlign ?? TEXT_ALIGN.LEFT as TextAlign,
    verticalAlign: style.verticalAlign ?? VERTICAL_ALIGN.MIDDLE as VerticalAlign,
  };
};

export const tableWidth = (colWidths: readonly number[]): number =>
  colWidths.reduce((sum, width) => sum + width, 0);

export const tableHeight = (rowHeights: readonly number[]): number =>
  rowHeights.reduce((sum, height) => sum + height, 0);

/** A fresh rows x cols grid of blank cells. */
export const buildCells = (rows: number, cols: number): TableCell[][] =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => emptyCell()),
  );

/** A draggable boundary between two tracks. */
export type TrackHandle = {
  axis: "col" | "row";
  /** The track resized by dragging this boundary. */
  index: number;
};

/**
 * The column or row boundary near a local point, if any. Boundary i sits at the
 * end of track i, so dragging it resizes that track and pushes everything after
 * it along, the way a spreadsheet does.
 */
export const getTrackHandleAtLocalPoint = (
  element: ExcalidrawTableElement,
  x: number,
  y: number,
  threshold: number,
): TrackHandle | null => {
  const xs = columnOffsets(element);
  const ys = rowOffsets(element);
  const width = xs[xs.length - 1];
  const height = ys[ys.length - 1];

  if (
    x < -threshold ||
    y < -threshold ||
    x > width + threshold ||
    y > height + threshold
  ) {
    return null;
  }

  let best: { handle: TrackHandle; distance: number } | null = null;
  const consider = (handle: TrackHandle, distance: number) => {
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { handle, distance };
    }
  };

  // Only interior boundaries: the table's outer edges belong to the element's
  // own resize handles, which must keep working.
  if (y >= 0 && y <= height) {
    for (let i = 1; i < xs.length - 1; i++) {
      consider({ axis: "col", index: i - 1 }, Math.abs(x - xs[i]));
    }
  }
  if (x >= 0 && x <= width) {
    for (let i = 1; i < ys.length - 1; i++) {
      consider({ axis: "row", index: i - 1 }, Math.abs(y - ys[i]));
    }
  }

  return best ? (best as { handle: TrackHandle }).handle : null;
};

/** Convert a scene point into the table's own unrotated coordinate space. */
export const toLocalPoint = (
  element: ExcalidrawTableElement,
  sceneX: number,
  sceneY: number,
): { x: number; y: number } => {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const cos = Math.cos(-element.angle);
  const sin = Math.sin(-element.angle);
  const dx = sceneX - centerX;
  const dy = sceneY - centerY;
  return {
    x: centerX + dx * cos - dy * sin - element.x,
    y: centerY + dx * sin + dy * cos - element.y,
  };
};
