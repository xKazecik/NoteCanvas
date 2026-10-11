import { describe, expect, it } from "vitest";
import {
  clearCells,
  deleteColumn,
  deleteRow,
  fillCells,
  mergeCells,
  newTableElement,
  parseTSV,
  rangeToTSV,
  sortRowsByColumn,
  toggleCellInPick,
} from "@excalidraw/element";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

/** A table whose cells hold the given text, one array per row. */
const tableOf = (rows: string[][]): ExcalidrawTableElement => {
  const table = newTableElement({
    x: 0,
    y: 0,
    rows: rows.length,
    cols: rows[0].length,
  });
  return {
    ...table,
    cells: table.cells.map((cells, r) =>
      cells.map((cell, c) => ({ ...cell, text: rows[r][c] })),
    ),
  };
};

const texts = (table: Pick<ExcalidrawTableElement, "cells">) =>
  table.cells.map((row) => row.map((cell) => cell.text));

describe("parseTSV", () => {
  it("splits rows on newlines and cells on tabs", () => {
    expect(parseTSV("a\tb\r\nc\td\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps tabs, newlines and quotes inside quoted cells", () => {
    expect(parseTSV('"two\nlines"\t"say ""hi"""\tplain')).toEqual([
      ["two\nlines", 'say "hi"', "plain"],
    ]);
  });

  it("treats a single value as a one-cell block", () => {
    expect(parseTSV("hello")).toEqual([["hello"]]);
  });
});

describe("rangeToTSV", () => {
  it("serialises a range so parseTSV reads it back unchanged", () => {
    const table = tableOf([
      ["a", "multi\nline"],
      ['quote "q"', "tab\there"],
    ]);
    const tsv = rangeToTSV(table, { top: 0, left: 0, bottom: 1, right: 1 });
    expect(parseTSV(tsv)).toEqual(texts(table));
  });

  it("only includes the requested range", () => {
    const table = tableOf([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
    expect(rangeToTSV(table, { top: 1, left: 1, bottom: 1, right: 2 })).toBe(
      "e\tf",
    );
  });
});

describe("clearCells", () => {
  it("empties the range but keeps formatting and other cells", () => {
    const base = tableOf([
      ["a", "b"],
      ["c", "d"],
    ]);
    const table = {
      ...base,
      cells: base.cells.map((row) =>
        row.map((cell) => ({ ...cell, style: { bold: true } })),
      ),
    };
    const { cells } = clearCells(table, {
      top: 0,
      left: 0,
      bottom: 1,
      right: 0,
    });
    expect(texts({ cells })).toEqual([
      ["", "b"],
      ["", "d"],
    ]);
    expect(cells[0][0].style).toEqual({ bold: true });
  });
});

describe("fillCells", () => {
  it("writes a block in place without resizing when it fits", () => {
    const table = tableOf([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
    const patch = fillCells(table, { row: 0, col: 1 }, [["x", "y"]]);
    expect(texts(patch)).toEqual([
      ["a", "x", "y"],
      ["d", "e", "f"],
    ]);
    expect(patch.width).toBe(table.width);
    expect(patch.height).toBe(table.height);
  });

  it("grows the grid when the block runs past the edge", () => {
    const table = tableOf([["a", "b"]]);
    const patch = fillCells(table, { row: 0, col: 1 }, [
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(texts(patch)).toEqual([
      ["a", "1", "2"],
      ["", "3", "4"],
    ]);
    expect(patch.colWidths).toHaveLength(3);
    expect(patch.rowHeights).toHaveLength(2);
    expect(patch.width).toBe(patch.colWidths.reduce((a, b) => a + b, 0));
    expect(patch.height).toBe(patch.rowHeights.reduce((a, b) => a + b, 0));
  });

  it("drops values that land on a slot hidden by a merge", () => {
    const base = tableOf([["a", "b", "c"]]);
    const table = {
      ...base,
      ...mergeCells(base, { row: 0, col: 0 }, { row: 0, col: 1 }),
    };
    const patch = fillCells(table, { row: 0, col: 0 }, [["x", "y", "z"]]);
    expect(patch.cells[0][0].text).toBe("x");
    expect(patch.cells[0][1].spannedBy).toEqual({ row: 0, col: 0 });
    expect(patch.cells[0][1].text).toBe("");
    expect(patch.cells[0][2].text).toBe("z");
  });
});

describe("sortRowsByColumn", () => {
  const table = tableOf([
    ["name", "qty"],
    ["pear", "10"],
    ["", "1"],
    ["apple", "2"],
  ]);

  it("keeps the header on top and compares numbers numerically", () => {
    const sorted = sortRowsByColumn({ ...table, headerRow: true }, 1, "asc");
    expect(texts(sorted!)).toEqual([
      ["name", "qty"],
      ["", "1"],
      ["apple", "2"],
      ["pear", "10"],
    ]);
  });

  it("sinks empty cells to the bottom in either direction", () => {
    const asc = sortRowsByColumn({ ...table, headerRow: true }, 0, "asc");
    const desc = sortRowsByColumn({ ...table, headerRow: true }, 0, "desc");
    expect(texts(asc!).map((row) => row[0])).toEqual([
      "name",
      "apple",
      "pear",
      "",
    ]);
    expect(texts(desc!).map((row) => row[0])).toEqual([
      "name",
      "pear",
      "apple",
      "",
    ]);
  });

  it("sorts every row when there is no header", () => {
    const sorted = sortRowsByColumn({ ...table, headerRow: false }, 0, "asc");
    expect(texts(sorted!).map((row) => row[0])).toEqual([
      "apple",
      "name",
      "pear",
      "",
    ]);
  });

  it("moves each row's height along with it", () => {
    const tall = {
      ...table,
      headerRow: true,
      rowHeights: [40, 80, 40, 40],
    };
    const sorted = sortRowsByColumn(tall, 0, "asc");
    // "pear" was the 80px row and sorts last among the non-empty names
    expect(sorted!.rowHeights).toEqual([40, 40, 80, 40]);
  });

  it("refuses to reorder body rows that contain a merge", () => {
    const merged = {
      ...table,
      headerRow: true,
      ...mergeCells(table, { row: 1, col: 0 }, { row: 1, col: 1 }),
    };
    expect(sortRowsByColumn(merged, 0, "asc")).toBeNull();
  });
});

describe("multi-track delete", () => {
  const table = tableOf([
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i"],
  ]);

  it("removes a run of rows at once", () => {
    const patch = deleteRow(table, 0, 2);
    expect(texts(patch!)).toEqual([["g", "h", "i"]]);
    expect(patch!.rowHeights).toHaveLength(1);
  });

  it("removes a run of columns at once", () => {
    const patch = deleteColumn(table, 1, 2);
    expect(texts(patch!)).toEqual([["a"], ["d"], ["g"]]);
    expect(patch!.width).toBe(patch!.colWidths[0]);
  });

  it("never removes every row or column", () => {
    expect(deleteRow(table, 0, 3)).toBeNull();
    expect(deleteColumn(table, 0, 3)).toBeNull();
  });
});

describe("toggleCellInPick (Ctrl+click)", () => {
  const table = tableOf([
    ["a", "b", "c"],
    ["d", "e", "f"],
  ]);
  const single = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } };

  it("adds a cell outside the pick and removes it on a second click", () => {
    const added = toggleCellInPick(table, single, { row: 1, col: 2 });
    expect(added.extra).toEqual([{ row: 1, col: 2 }]);
    const removed = toggleCellInPick(table, added, { row: 1, col: 2 });
    expect(removed.extra).toEqual([]);
  });

  it("hands the lone main cell over to the next added cell", () => {
    const pick = { ...single, extra: [{ row: 1, col: 1 }] };
    expect(toggleCellInPick(table, pick, { row: 0, col: 0 })).toEqual({
      anchor: { row: 1, col: 1 },
      focus: { row: 1, col: 1 },
      extra: [],
    });
  });

  it("leaves a cell inside a larger range alone", () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 1, col: 1 } };
    expect(toggleCellInPick(table, range, { row: 1, col: 0 })).toBe(range);
  });
});
