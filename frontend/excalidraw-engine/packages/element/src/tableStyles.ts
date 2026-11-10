import type { ExcalidrawTableElement } from "./types";

/**
 * A named look for a whole table. The element stores only the preset's id;
 * the colours are resolved when painting, so a preset can be refined later
 * without rewriting every drawing that uses it.
 *
 * Colours are written for the light theme. The canvas inverts itself for the
 * dark theme, which carries them over the same way it does every other
 * element colour.
 */
export type TableStylePreset = {
  id: string;
  /** Header row fill and text; null keeps the neutral tint / the text colour. */
  headerFill: string | null;
  headerText: string | null;
  /** Fill of every other body row when banding is on; null for the neutral tint. */
  bandFill: string | null;
  /** Which lines between cells are drawn. */
  grid: "all" | "rows" | "none";
  /** Line colour; null follows the element's own stroke colour. */
  lineColor: string | null;
  /** Draw the table's outer border. */
  outline: boolean;
  /** Underline the header row with a heavier rule. */
  headerRule: boolean;
  /** Whether choosing the preset switches banded rows on or off. */
  banded: boolean;
};

const colorPreset = (
  id: string,
  headerFill: string,
  bandFill: string,
  lineColor: string,
): TableStylePreset => ({
  id,
  headerFill,
  headerText: "#ffffff",
  bandFill,
  grid: "all",
  lineColor,
  outline: true,
  headerRule: false,
  banded: true,
});

export const TABLE_STYLE_PRESETS: readonly TableStylePreset[] = [
  {
    id: "default",
    headerFill: null,
    headerText: null,
    bandFill: null,
    grid: "all",
    lineColor: null,
    outline: true,
    headerRule: false,
    banded: false,
  },
  colorPreset("blue", "#1971c2", "#e7f5ff", "#a5d8ff"),
  colorPreset("green", "#2f9e44", "#ebfbee", "#b2f2bb"),
  colorPreset("orange", "#e8590c", "#fff4e6", "#ffd8a8"),
  colorPreset("violet", "#6741d9", "#f3f0ff", "#d0bfff"),
  colorPreset("dark", "#343a40", "#f1f3f5", "#ced4da"),
  {
    id: "minimal",
    headerFill: "transparent",
    headerText: null,
    bandFill: null,
    grid: "rows",
    lineColor: "#ced4da",
    outline: false,
    headerRule: true,
    banded: false,
  },
  {
    id: "striped",
    headerFill: "transparent",
    headerText: null,
    bandFill: null,
    grid: "none",
    lineColor: null,
    outline: false,
    headerRule: true,
    banded: true,
  },
];

export const DEFAULT_TABLE_STYLE_PRESET = TABLE_STYLE_PRESETS[0];

/** The preset a table uses; an unknown or absent id is the default look. */
export const getTableStylePreset = (
  element: Pick<ExcalidrawTableElement, "stylePreset">,
): TableStylePreset =>
  TABLE_STYLE_PRESETS.find((preset) => preset.id === element.stylePreset) ??
  DEFAULT_TABLE_STYLE_PRESET;

export type TableLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The rule under the header row, drawn heavier than the grid. */
  heavy?: boolean;
};

/**
 * The lines to stroke for a table, in its own coordinate space. One list for
 * both the canvas and SVG painters, so they cannot drift apart.
 *
 * Merged cells swallow their interior borders, so rather than ruling the full
 * grid this takes each surviving cell's right and bottom edge, plus the
 * table's own top and left edge.
 */
export const getTableLines = (
  boxes: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
    row: number;
  }[],
  size: { width: number; height: number },
  preset: TableStylePreset,
  headerRow: boolean,
): TableLine[] => {
  const lines: TableLine[] = [];
  const { width, height } = size;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

  if (preset.outline) {
    lines.push({ x1: 0, y1: 0, x2: width, y2: 0 });
    lines.push({ x1: 0, y1: 0, x2: 0, y2: height });
  }

  for (const box of boxes) {
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const isOuterRight = near(right, width);
    const isOuterBottom = near(bottom, height);

    if (isOuterRight ? preset.outline : preset.grid === "all") {
      lines.push({ x1: right, y1: box.y, x2: right, y2: bottom });
    }
    const isHeaderRule =
      preset.headerRule && headerRow && box.row === 0 && !isOuterBottom;
    if (
      isHeaderRule ||
      (isOuterBottom ? preset.outline : preset.grid !== "none")
    ) {
      lines.push({
        x1: box.x,
        y1: bottom,
        x2: right,
        y2: bottom,
        ...(isHeaderRule ? { heavy: true } : {}),
      });
    }
  }
  return lines;
};
