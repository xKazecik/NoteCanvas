import { getFontString } from "@excalidraw/common";

import {
  TABLE_DEFAULTS,
  columnOffsets,
  getCellBoxes,
  resolveCellStyle,
  rowOffsets,
} from "./table";
import { getTableLines, getTableStylePreset } from "./tableStyles";
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
 * so the header and banding tints are deliberately low-contrast instead of
 * following the element's own background colour.
 *
 * There is one set for both themes: in the dark theme the canvas (and a dark
 * export) is drawn in these colours and then inverted as a whole, which turns
 * them into the matching dark tints. Picking dark colours here as well would
 * invert them a second time, into bright bands.
 */
const TINTS = { header: "#f1f3f5", banding: "#f8f9fa" } as const;

/** Unitless line height used for cell text. Matches the engine's text default. */
export const CELL_LINE_HEIGHT = 1.25 as ExcalidrawTextElement["lineHeight"];

export const getTableTints = (_theme: Theme) => TINTS;

/**
 * The colours `resolveCellStyle` needs for a table: its style preset's, with
 * the theme's neutral tints wherever the preset does not set one.
 */
export const getTableCellColors = (
  element: ExcalidrawTableElement,
  theme: Theme,
) => {
  const tints = getTableTints(theme);
  const preset = getTableStylePreset(element);
  return {
    headerColor: preset.headerFill ?? tints.header,
    bandingColor: preset.bandFill ?? tints.banding,
    headerTextColor: preset.headerText,
  };
};

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
  const style = resolveCellStyle(
    element,
    box.row,
    box.col,
    getTableCellColors(element, theme),
  );

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
  const colors = getTableCellColors(element, theme);
  const preset = getTableStylePreset(element);

  context.save();

  for (const box of boxes) {
    const style = resolveCellStyle(element, box.row, box.col, colors);
    if (style.backgroundColor) {
      context.fillStyle = style.backgroundColor;
      context.fillRect(box.x, box.y, box.width, box.height);
    }
  }

  const xs = columnOffsets(element);
  const ys = rowOffsets(element);
  const lines = getTableLines(
    boxes,
    { width: xs[xs.length - 1], height: ys[ys.length - 1] },
    preset,
    element.headerRow,
  );
  context.lineCap = "butt";
  // the grid in one path so shared borders do not double-strike, then the
  // heavier header rule over it in the element's own colour
  const stroke = (heavy: boolean) => {
    context.strokeStyle = heavy
      ? element.strokeColor
      : preset.lineColor ?? element.strokeColor;
    context.lineWidth = element.strokeWidth * (heavy ? 2 : 1);
    context.beginPath();
    for (const line of lines) {
      if (!!line.heavy === heavy) {
        context.moveTo(line.x1, line.y1);
        context.lineTo(line.x2, line.y2);
      }
    }
    context.stroke();
  };
  stroke(false);
  stroke(true);

  for (const box of boxes) {
    paintCellText(element, box, context, theme);
  }

  context.restore();
};
