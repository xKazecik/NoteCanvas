import { describe, expect, it } from "vitest";
import {
  deleteColumn,
  deleteRow,
  getCellAtLocalPoint,
  getCellBox,
  getCellBoxes,
  getTrackHandleAtLocalPoint,
  insertColumn,
  insertRow,
  mergeCells,
  newTableElement,
  normalizeRange,
  normalizeTable,
  scaleTableTo,
  setColumnWidth,
  setRowHeight,
  toLocalPoint,
  unmergeCells,
} from "@excalidraw/element";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

/** A table with predictable track sizes and every cell labelled "r,c". */
const makeTable = (rows = 3, cols = 3): ExcalidrawTableElement => {
  const table = newTableElement({ x: 0, y: 0, rows, cols });
  return {
    ...table,
    cells: table.cells.map((row, r) =>
      row.map((cell, c) => ({ ...cell, text: `${r},${c}` })),
    ),
  };
};

/** Apply a patch the way the action does, so invariants are checked post-merge. */
const apply = (
  table: ExcalidrawTableElement,
  patch: Partial<ExcalidrawTableElement> | null,
): ExcalidrawTableElement => {
  expect(patch).not.toBeNull();
  return { ...table, ...patch! };
};

/** Invariants every table must satisfy after any operation. */
const expectConsistent = (table: ExcalidrawTableElement) => {
  expect(table.cells).toHaveLength(table.rowHeights.length);
  for (const row of table.cells) {
    expect(row).toHaveLength(table.colWidths.length);
  }
  expect(table.width).toBeCloseTo(
    table.colWidths.reduce((sum, w) => sum + w, 0),
  );
  expect(table.height).toBeCloseTo(
    table.rowHeights.reduce((sum, h) => sum + h, 0),
  );
  // every spannedBy must point at a real anchor that actually covers it
  table.cells.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell.spannedBy) {
        return;
      }
      const anchor = table.cells[cell.spannedBy.row]?.[cell.spannedBy.col];
      expect(anchor).toBeDefined();
      expect(anchor!.spannedBy).toBeUndefined();
      expect(cell.spannedBy.row + (anchor!.rowSpan ?? 1)).toBeGreaterThan(r);
      expect(cell.spannedBy.col + (anchor!.colSpan ?? 1)).toBeGreaterThan(c);
    });
  });
};

describe("table geometry", () => {
  it("derives the outer box from the track sizes", () => {
    const table = makeTable(2, 4);
    expect(table.width).toBe(
      table.colWidths.reduce((sum, width) => sum + width, 0),
    );
    expect(table.height).toBe(
      table.rowHeights.reduce((sum, height) => sum + height, 0),
    );
  });

  it("maps a local point to the cell containing it", () => {
    const table = makeTable();
    const [w0, w1] = table.colWidths;
    const [h0] = table.rowHeights;

    expect(getCellAtLocalPoint(table, 1, 1)).toEqual({ row: 0, col: 0 });
    expect(getCellAtLocalPoint(table, w0 + 1, 1)).toEqual({ row: 0, col: 1 });
    expect(getCellAtLocalPoint(table, w0 + w1 + 1, h0 + 1)).toEqual({
      row: 1,
      col: 2,
    });
  });

  it("returns null for points outside the table", () => {
    const table = makeTable();
    expect(getCellAtLocalPoint(table, -5, 5)).toBeNull();
    expect(getCellAtLocalPoint(table, table.width + 5, 5)).toBeNull();
    expect(getCellAtLocalPoint(table, 5, table.height + 5)).toBeNull();
  });
});

describe("rows and columns", () => {
  it("inserts a row and keeps existing content in place", () => {
    const table = apply(makeTable(), insertRow(makeTable(), 1));
    expectConsistent(table);
    expect(table.rowHeights).toHaveLength(4);
    expect(table.cells[0][0].text).toBe("0,0");
    expect(table.cells[1][0].text).toBe("");
    expect(table.cells[2][0].text).toBe("1,0");
  });

  it("inserts a column and keeps existing content in place", () => {
    const table = apply(makeTable(), insertColumn(makeTable(), 0));
    expectConsistent(table);
    expect(table.colWidths).toHaveLength(4);
    expect(table.cells[0][0].text).toBe("");
    expect(table.cells[0][1].text).toBe("0,0");
  });

  it("deletes a row", () => {
    const table = apply(makeTable(), deleteRow(makeTable(), 0));
    expectConsistent(table);
    expect(table.rowHeights).toHaveLength(2);
    expect(table.cells[0][0].text).toBe("1,0");
  });

  it("deletes a column", () => {
    const table = apply(makeTable(), deleteColumn(makeTable(), 1));
    expectConsistent(table);
    expect(table.colWidths).toHaveLength(2);
    expect(table.cells[0][1].text).toBe("0,2");
  });

  it("refuses to delete the last row or column", () => {
    const single = makeTable(1, 1);
    expect(deleteRow(single, 0)).toBeNull();
    expect(deleteColumn(single, 0)).toBeNull();
  });
});

describe("merging", () => {
  it("merges a range into its top-left cell and joins the text", () => {
    const table = apply(
      makeTable(),
      mergeCells(makeTable(), { row: 0, col: 0 }, { row: 1, col: 1 }),
    );
    expectConsistent(table);

    const anchor = table.cells[0][0];
    expect(anchor.colSpan).toBe(2);
    expect(anchor.rowSpan).toBe(2);
    expect(anchor.text).toBe("0,0 0,1 1,0 1,1");
    expect(table.cells[0][1].spannedBy).toEqual({ row: 0, col: 0 });
    expect(table.cells[1][1].spannedBy).toEqual({ row: 0, col: 0 });

    // the merged cell is drawn once, covering all four slots
    const box = getCellBox(table, 0, 0)!;
    expect(box.width).toBe(table.colWidths[0] + table.colWidths[1]);
    expect(box.height).toBe(table.rowHeights[0] + table.rowHeights[1]);
    expect(getCellBox(table, 0, 1)).toBeNull();
    expect(getCellBoxes(table)).toHaveLength(9 - 3);
  });

  it("resolves a point inside a merged region to the anchor cell", () => {
    const table = apply(
      makeTable(),
      mergeCells(makeTable(), { row: 0, col: 0 }, { row: 1, col: 1 }),
    );
    const inSecondSlot = getCellAtLocalPoint(
      table,
      table.colWidths[0] + 1,
      table.rowHeights[0] + 1,
    );
    expect(inSecondSlot).toEqual({ row: 0, col: 0 });
  });

  it("unmerges back to individual cells", () => {
    const merged = apply(
      makeTable(),
      mergeCells(makeTable(), { row: 0, col: 0 }, { row: 1, col: 1 }),
    );
    const table = apply(merged, unmergeCells(merged, { row: 1, col: 1 }));
    expectConsistent(table);
    expect(table.cells[0][0].colSpan).toBeUndefined();
    expect(table.cells[1][1].spannedBy).toBeUndefined();
    expect(getCellBoxes(table)).toHaveLength(9);
  });

  it("grows a selection range to cover partially-touched merges", () => {
    const table = apply(
      makeTable(),
      mergeCells(makeTable(), { row: 0, col: 0 }, { row: 1, col: 1 }),
    );
    // touching only the bottom-right slot of the merge pulls in the whole block
    expect(normalizeRange(table, { row: 1, col: 1 }, { row: 1, col: 1 })).toEqual(
      { top: 0, left: 0, bottom: 1, right: 1 },
    );
  });

  it("splits a merge that a new row would cut through", () => {
    const merged = apply(
      makeTable(),
      mergeCells(makeTable(), { row: 0, col: 0 }, { row: 1, col: 1 }),
    );
    const table = apply(merged, insertRow(merged, 1));
    expectConsistent(table);
    expect(table.cells[0][0].rowSpan).toBeUndefined();
    expect(table.cells[0][0].colSpan).toBeUndefined();
  });
});

describe("resizing", () => {
  it("reflows tracks proportionally to fill a new size", () => {
    const table = makeTable(2, 2);
    const scaled = apply(table, scaleTableTo(table, table.width * 2, table.height));
    expectConsistent(scaled);
    expect(scaled.width).toBeCloseTo(table.width * 2);
    expect(scaled.height).toBeCloseTo(table.height);
    expect(scaled.colWidths[0]).toBeCloseTo(table.colWidths[0] * 2);
    expect(scaled.rowHeights[0]).toBeCloseTo(table.rowHeights[0]);
  });

  it("never shrinks a track below its minimum", () => {
    const table = makeTable(2, 2);
    const scaled = apply(table, scaleTableTo(table, 1, 1));
    for (const width of scaled.colWidths) {
      expect(width).toBeGreaterThan(0);
    }
    for (const height of scaled.rowHeights) {
      expect(height).toBeGreaterThan(0);
    }
  });
});

describe("track handles", () => {
  it("finds the column boundary under a nearby point", () => {
    const table = makeTable();
    const boundary = table.colWidths[0];
    expect(getTrackHandleAtLocalPoint(table, boundary + 2, 20, 5)).toEqual({
      axis: "col",
      index: 0,
    });
  });

  it("finds the row boundary under a nearby point", () => {
    const table = makeTable();
    const boundary = table.rowHeights[0];
    // x sits mid-column so only the row boundary is in range
    expect(
      getTrackHandleAtLocalPoint(table, table.colWidths[0] / 2, boundary - 2, 5),
    ).toEqual({ axis: "row", index: 0 });
  });

  it("ignores the table's outer edges, which belong to the element handles", () => {
    const table = makeTable();
    expect(getTrackHandleAtLocalPoint(table, 0, 20, 5)).toBeNull();
    expect(getTrackHandleAtLocalPoint(table, table.width, 20, 5)).toBeNull();
    expect(getTrackHandleAtLocalPoint(table, 20, table.height, 5)).toBeNull();
  });

  it("returns nothing when the point is not near any boundary", () => {
    const table = makeTable();
    expect(
      getTrackHandleAtLocalPoint(
        table,
        table.colWidths[0] / 2,
        table.rowHeights[0] / 2,
        5,
      ),
    ).toBeNull();
  });

  it("resizes only the dragged track", () => {
    const table = makeTable();
    const resized = apply(table, setColumnWidth(table, 0, 200));
    expectConsistent(resized);
    expect(resized.colWidths[0]).toBe(200);
    expect(resized.colWidths[1]).toBe(table.colWidths[1]);
    expect(resized.rowHeights).toEqual(table.rowHeights);

    const taller = apply(table, setRowHeight(table, 1, 90));
    expectConsistent(taller);
    expect(taller.rowHeights[1]).toBe(90);
    expect(taller.rowHeights[0]).toBe(table.rowHeights[0]);
  });

  it("clamps a track to its minimum size", () => {
    const table = makeTable();
    const resized = apply(table, setColumnWidth(table, 0, -50));
    expect(resized.colWidths[0]).toBeGreaterThan(0);
  });

  it("maps scene points into the table's own space, including rotation", () => {
    const table = { ...makeTable(), x: 100, y: 50 };
    expect(toLocalPoint(table, 110, 60)).toEqual({ x: 10, y: 10 });

    // a quarter turn puts the table's local +x along the scene's +y
    const rotated = { ...table, angle: (Math.PI / 2) as typeof table.angle };
    const center = {
      x: rotated.x + rotated.width / 2,
      y: rotated.y + rotated.height / 2,
    };
    const local = toLocalPoint(rotated, center.x, center.y);
    expect(local.x).toBeCloseTo(rotated.width / 2);
    expect(local.y).toBeCloseTo(rotated.height / 2);
  });
});

describe("normalizeTable", () => {
  it("rebuilds a grid that does not match its track counts", () => {
    const patch = normalizeTable({
      colWidths: [100, 100, 100],
      rowHeights: [40, 40],
      // only one row, and it is too short
      cells: [[{ text: "kept" }]],
    } as Partial<ExcalidrawTableElement>);

    expect(patch.cells).toHaveLength(2);
    expect(patch.cells[0]).toHaveLength(3);
    expect(patch.cells[0][0].text).toBe("kept");
    expect(patch.cells[1][2].text).toBe("");
    expect(patch.width).toBe(300);
    expect(patch.height).toBe(80);
  });

  it("falls back to defaults when the tracks are missing or corrupt", () => {
    const patch = normalizeTable({
      colWidths: [Number.NaN, 100],
      rowHeights: undefined,
      cells: undefined,
    } as Partial<ExcalidrawTableElement>);

    expect(patch.colWidths).toHaveLength(2);
    expect(patch.colWidths.every((w) => Number.isFinite(w) && w > 0)).toBe(true);
    expect(patch.rowHeights.length).toBeGreaterThan(0);
    expect(patch.width).toBeCloseTo(
      patch.colWidths.reduce((sum, w) => sum + w, 0),
    );
  });

  it("drops spans that would run off the edge of the grid", () => {
    const patch = normalizeTable({
      colWidths: [100, 100],
      rowHeights: [40, 40],
      cells: [
        [{ text: "wide", colSpan: 5 }, { text: "" }],
        [{ text: "" }, { text: "" }],
      ],
    } as Partial<ExcalidrawTableElement>);

    expect(patch.cells[0][0].colSpan).toBe(2);
    expect(patch.cells[0][1].spannedBy).toEqual({ row: 0, col: 0 });
  });
});
