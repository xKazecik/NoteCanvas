import { THEME, getFontString } from "@excalidraw/common";

import {
  TABLE_DEFAULTS,
  columnOffsets,
  getCellBoxes,
  resolveCellStyle,
  rowOffsets,
} from "./table";
import { getLineHeightInPx } from "./textMeasurements";
import { wrapText } from "./textWrapping";

import type { CellBox } from "./table";
import type {
  ExcalidrawTableElement,
  ExcalidrawTextElement,
  Theme,
} from "./types";

/**
 * Table chrome colours. Tables are read like a document rather than a sketch,
 * so the header and banding tints are deliberately low-contrast and theme-aware
 * instead of following the element's own background colour.
 */
const TINTS = {
  [THEME.LIGHT]: { header: "#f1f3f5", banding: "#f8f9fa" },
  [THEME.DARK]: { header: "#2a2d33", banding: "#232529" },
} as const;

/** Unitless line height used for cell text. Matches the engine's text default. */
const CELL_LINE_HEIGHT = 1.25 as ExcalidrawTextElement["lineHeight"];

export const getTableTints = (theme: Theme) =>
  TINTS[theme === THEME.DARK ? THEME.DARK : THEME.LIGHT];

const paintCellText = (
  element: ExcalidrawTableElement,
  box: CellBox,
  context: CanvasRenderingContext2D,
  theme: Theme,
) => {
  const cell = element.cells[box.row]?.[box.col];
  if (!cell?.text) {
    return;
  }
  const style = resolveCellStyle(element, box.row, box.col, {
    headerColor: getTableTints(theme).header,
    bandingColor: getTableTints(theme).banding,
  });

  const padding = TABLE_DEFAULTS.cellPadding;
  const innerWidth = Math.max(0, box.width - padding * 2);
  const font = getFontString({
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
  });

  context.save();
  // canvas wants the weight/style prefix ahead of the size, which getFontString
  // does not emit because regular elements have no bold/italic
  context.font = `${style.italic ? "italic " : ""}${
    style.bold ? "bold " : ""
  }${font}`;
  context.fillStyle = style.textColor;
  context.textAlign = style.textAlign as CanvasTextAlign;
  context.textBaseline = "alphabetic";

  const lines = wrapText(cell.text, font, innerWidth).split("\n");
  const lineHeight = getLineHeightInPx(style.fontSize, CELL_LINE_HEIGHT);
  const textHeight = lines.length * lineHeight;

  let top = box.y + padding;
  if (style.verticalAlign === "middle") {
    top = box.y + (box.height - textHeight) / 2;
  } else if (style.verticalAlign === "bottom") {
    top = box.y + box.height - padding - textHeight;
  }

  let x = box.x + padding;
  if (style.textAlign === "center") {
    x = box.x + box.width / 2;
  } else if (style.textAlign === "right") {
    x = box.x + box.width - padding;
  }

  context.beginPath();
  context.rect(box.x, box.y, box.width, box.height);
  context.clip();

  for (let i = 0; i < lines.length; i++) {
    // baseline sits ~0.8 of the way down the line box for most latin faces
    context.fillText(lines[i], x, top + i * lineHeight + style.fontSize * 0.8);
  }
  context.restore();
};

/**
 * Paints a table into a context already translated to the element's top-left
 * corner and rotated by its angle.
 *
 * Drawn as: cell fills, then grid lines, then text. Grid lines are painted in
 * one pass over the track offsets rather than per-cell so shared borders do not
 * double-strike, and the segments that fall inside a merged cell are skipped.
 */
export const renderTableElement = (
  element: ExcalidrawTableElement,
  context: CanvasRenderingContext2D,
  theme: Theme,
) => {
  const boxes = getCellBoxes(element);
  const tints = getTableTints(theme);

  context.save();

  for (const box of boxes) {
    const style = resolveCellStyle(element, box.row, box.col, {
      headerColor: tints.header,
      bandingColor: tints.banding,
    });
    if (style.backgroundColor) {
      context.fillStyle = style.backgroundColor;
      context.fillRect(box.x, box.y, box.width, box.height);
    }
  }

  context.strokeStyle = element.strokeColor;
  context.lineWidth = element.strokeWidth;
  context.lineCap = "butt";
  context.beginPath();

  // Merged cells swallow their interior borders, so instead of stroking the
  // full grid we stroke each surviving cell's right and bottom edge, plus the
  // table's own top and left edge.
  const xs = columnOffsets(element);
  const ys = rowOffsets(element);
  const right = xs[xs.length - 1];
  const bottom = ys[ys.length - 1];

  context.moveTo(0, 0);
  context.lineTo(right, 0);
  context.moveTo(0, 0);
  context.lineTo(0, bottom);

  for (const box of boxes) {
    context.moveTo(box.x + box.width, box.y);
    context.lineTo(box.x + box.width, box.y + box.height);
    context.moveTo(box.x, box.y + box.height);
    context.lineTo(box.x + box.width, box.y + box.height);
  }
  context.stroke();

  for (const box of boxes) {
    paintCellText(element, box, context, theme);
  }

  context.restore();
};
