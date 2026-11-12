import { describe, expect, it } from "vitest";
import {
  TABLE_STYLE_PRESETS,
  getCellBoxes,
  getTableCustomStyle,
  getTableLineColor,
  getTableLines,
  getTableStylePreset,
  newTableElement,
  resolveCellStyle,
} from "@excalidraw/element";

const preset = (id: string) =>
  TABLE_STYLE_PRESETS.find((candidate) => candidate.id === id)!;

const linesFor = (id: string) => {
  const table = newTableElement({ x: 0, y: 0, rows: 3, cols: 2 });
  return getTableLines(
    getCellBoxes(table),
    { width: table.width, height: table.height },
    preset(id),
    true,
  );
};

const isVertical = (line: { x1: number; x2: number }) => line.x1 === line.x2;

describe("table style presets", () => {
  it("falls back to the default look for a missing or unknown preset", () => {
    expect(getTableStylePreset({}).id).toBe("default");
    expect(getTableStylePreset({ stylePreset: "nope" }).id).toBe("default");
    expect(getTableStylePreset({ stylePreset: "blue" }).id).toBe("blue");
  });

  it("rules the whole grid by default", () => {
    // top + left edge, then a right and a bottom edge per cell
    expect(linesFor("default")).toHaveLength(2 + 6 * 2);
  });

  it("draws only row lines for the minimal preset, with a header rule", () => {
    const lines = linesFor("minimal");
    expect(lines.some(isVertical)).toBe(false);
    // rows 0 and 1 have a line under them; the outer bottom edge is left off
    expect(lines).toHaveLength(4);
    expect(lines.filter((line) => line.heavy)).toHaveLength(2);
  });

  it("draws nothing but the header rule for the striped preset", () => {
    const lines = linesFor("striped");
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.heavy)).toBe(true);
  });

  it("gives a coloured header its contrasting text colour", () => {
    const table = newTableElement({ x: 0, y: 0, rows: 2, cols: 1 });
    const colors = {
      headerColor: "#1971c2",
      bandingColor: "#e7f5ff",
      headerTextColor: "#ffffff",
    };
    expect(resolveCellStyle(table, 0, 0, colors).textColor).toBe("#ffffff");
    expect(resolveCellStyle(table, 1, 0, colors).textColor).toBe(
      table.strokeColor,
    );
  });

  it("draws the custom preset in the table's own colours", () => {
    const customStyle = {
      headerFill: "#e03131",
      headerText: "#ffffff",
      bandFill: "#fff5f5",
    };
    const custom = getTableStylePreset({ stylePreset: "custom", customStyle });
    expect(custom).toMatchObject({ id: "custom", ...customStyle });
    // without colours to draw in, custom is the default look
    expect(getTableStylePreset({ stylePreset: "custom" }).id).toBe("default");
  });

  it("starts the custom colours from the look the table has now", () => {
    const table = {
      ...newTableElement({ x: 0, y: 0, rows: 2, cols: 1 }),
      stylePreset: "blue",
    };
    expect(getTableCustomStyle(table)).toEqual({
      headerFill: "#1971c2",
      headerText: "#ffffff",
      bandFill: "#e7f5ff",
    });
  });

  it("strokes every line in a picked border colour", () => {
    const table = newTableElement({ x: 0, y: 0, rows: 2, cols: 1 });
    expect(getTableLineColor(table, preset("blue"), false)).toBe("#a5d8ff");
    expect(getTableLineColor(table, preset("minimal"), true)).toBe(
      table.strokeColor,
    );
    const bordered = { ...table, borderColor: "#2f9e44" };
    expect(getTableLineColor(bordered, preset("blue"), false)).toBe("#2f9e44");
    expect(getTableLineColor(bordered, preset("minimal"), true)).toBe(
      "#2f9e44",
    );
  });
});
