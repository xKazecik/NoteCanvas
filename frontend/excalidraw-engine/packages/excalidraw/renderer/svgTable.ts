import {
  SVG_NS,
  THEME,
  getFontFamilyString,
  getFontString,
} from "@excalidraw/common";

import {
  TABLE_DEFAULTS,
  columnOffsets,
  getCellBoxes,
  getTableTints,
  resolveCellStyle,
  rowOffsets,
  wrapText,
} from "@excalidraw/element";

import type { ExcalidrawTableElement, Theme } from "@excalidraw/element/types";

/** Matches the canvas painter, so exports line up with what is on screen. */
const CELL_LINE_HEIGHT = 1.25;

const svg = (tag: string) => document.createElementNS(SVG_NS, tag);

/**
 * Builds the SVG mirror of `renderTableElement`. Kept as a separate pass rather
 * than shared with the canvas painter because the two output models differ too
 * much (immediate-mode 2d context vs. a node tree) for a useful abstraction.
 */
export const renderTableToSvg = (
  element: ExcalidrawTableElement,
  theme: Theme,
): SVGGElement => {
  const group = svg("g") as SVGGElement;
  const boxes = getCellBoxes(element);
  const tints = getTableTints(theme);

  for (const box of boxes) {
    const style = resolveCellStyle(element, box.row, box.col, {
      headerColor: tints.header,
      bandingColor: tints.banding,
    });
    if (style.backgroundColor) {
      const rect = svg("rect");
      rect.setAttribute("x", `${box.x}`);
      rect.setAttribute("y", `${box.y}`);
      rect.setAttribute("width", `${box.width}`);
      rect.setAttribute("height", `${box.height}`);
      rect.setAttribute("fill", style.backgroundColor);
      group.appendChild(rect);
    }
  }

  const xs = columnOffsets(element);
  const ys = rowOffsets(element);
  const segments: string[] = [
    `M 0 0 H ${xs[xs.length - 1]}`,
    `M 0 0 V ${ys[ys.length - 1]}`,
  ];
  for (const box of boxes) {
    segments.push(`M ${box.x + box.width} ${box.y} V ${box.y + box.height}`);
    segments.push(`M ${box.x} ${box.y + box.height} H ${box.x + box.width}`);
  }
  const grid = svg("path");
  grid.setAttribute("d", segments.join(" "));
  grid.setAttribute("stroke", element.strokeColor);
  grid.setAttribute("stroke-width", `${element.strokeWidth}`);
  grid.setAttribute("fill", "none");
  group.appendChild(grid);

  for (const box of boxes) {
    const cell = element.cells[box.row]?.[box.col];
    if (!cell?.text) {
      continue;
    }
    const style = resolveCellStyle(element, box.row, box.col, {
      headerColor: tints.header,
      bandingColor: tints.banding,
    });
    const padding = TABLE_DEFAULTS.cellPadding;
    const font = getFontString({
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
    });
    const lines = wrapText(
      cell.text,
      font,
      Math.max(0, box.width - padding * 2),
    ).split("\n");
    const lineHeight = style.fontSize * CELL_LINE_HEIGHT;
    const textHeight = lines.length * lineHeight;

    let top = box.y + padding;
    if (style.verticalAlign === "middle") {
      top = box.y + (box.height - textHeight) / 2;
    } else if (style.verticalAlign === "bottom") {
      top = box.y + box.height - padding - textHeight;
    }

    let x = box.x + padding;
    let anchor = "start";
    if (style.textAlign === "center") {
      x = box.x + box.width / 2;
      anchor = "middle";
    } else if (style.textAlign === "right") {
      x = box.x + box.width - padding;
      anchor = "end";
    }

    const text = svg("text");
    text.setAttribute("x", `${x}`);
    text.setAttribute("y", `${top + style.fontSize * 0.8}`);
    text.setAttribute("font-family", getFontFamilyString(style));
    text.setAttribute("font-size", `${style.fontSize}px`);
    text.setAttribute("fill", style.textColor);
    text.setAttribute("text-anchor", anchor);
    if (style.bold) {
      text.setAttribute("font-weight", "bold");
    }
    if (style.italic) {
      text.setAttribute("font-style", "italic");
    }

    for (let i = 0; i < lines.length; i++) {
      const tspan = svg("tspan");
      tspan.setAttribute("x", `${x}`);
      tspan.setAttribute("y", `${top + i * lineHeight + style.fontSize * 0.8}`);
      tspan.textContent = lines[i];
      text.appendChild(tspan);
    }
    group.appendChild(text);
  }

  return group;
};

export const themeForExport = (exportWithDarkMode: boolean): Theme =>
  exportWithDarkMode ? THEME.DARK : THEME.LIGHT;
