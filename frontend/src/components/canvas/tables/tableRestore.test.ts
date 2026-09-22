import { beforeAll, describe, expect, it } from "vitest";
import { newTableElement } from "@excalidraw/element";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

// The editor bundle probes canvas capabilities while its modules evaluate, and
// jsdom has no 2d context, so it is stubbed before the dynamic import below.
let restoreElements: typeof import("@excalidraw/excalidraw")["restoreElements"];

beforeAll(async () => {
  HTMLCanvasElement.prototype.getContext = (() =>
    ({ filter: "none", measureText: () => ({ width: 0 }) } as unknown)) as never;
  ({ restoreElements } = await import("@excalidraw/excalidraw"));
});

/**
 * Tables travel through JSON on every save and on every collaboration message,
 * so what matters is that a round trip preserves the grid and that a damaged
 * payload still comes back as a usable table instead of breaking the scene.
 */
const roundTrip = (element: unknown): ExcalidrawTableElement | undefined => {
  const restored = restoreElements(
    JSON.parse(JSON.stringify([element])),
    null,
  );
  return restored.find((el) => el.type === "table") as
    | ExcalidrawTableElement
    | undefined;
};

describe("table persistence", () => {
  it("survives a save/load round trip with its content intact", () => {
    const table = {
      ...newTableElement({ x: 10, y: 20, rows: 2, cols: 2 }),
      headerRow: true,
      bandedRows: true,
    };
    const withContent = {
      ...table,
      cells: [
        [
          { text: "Name", style: { bold: true, backgroundColor: "#ffc9c9" } },
          { text: "Total" },
        ],
        [{ text: "North" }, { text: "42" }],
      ],
    };

    const restored = roundTrip(withContent);

    expect(restored).toBeDefined();
    expect(restored!.cells[0][0].text).toBe("Name");
    expect(restored!.cells[0][0].style).toEqual({
      bold: true,
      backgroundColor: "#ffc9c9",
    });
    expect(restored!.cells[1][1].text).toBe("42");
    expect(restored!.headerRow).toBe(true);
    expect(restored!.bandedRows).toBe(true);
    expect(restored!.width).toBe(
      restored!.colWidths.reduce((sum, w) => sum + w, 0),
    );
  });

  it("preserves merges across a round trip", () => {
    const table = newTableElement({ x: 0, y: 0, rows: 2, cols: 2 });
    const merged = {
      ...table,
      cells: [
        [
          { text: "wide", colSpan: 2 },
          { text: "", spannedBy: { row: 0, col: 0 } },
        ],
        [{ text: "a" }, { text: "b" }],
      ],
    };

    const restored = roundTrip(merged)!;
    expect(restored.cells[0][0].colSpan).toBe(2);
    expect(restored.cells[0][1].spannedBy).toEqual({ row: 0, col: 0 });
  });

  it("repairs a table whose grid does not match its tracks", () => {
    const table = newTableElement({ x: 0, y: 0, rows: 3, cols: 3 });
    const damaged = {
      ...table,
      // a shorter grid than the tracks claim, and a stale outer size
      cells: [[{ text: "only" }]],
      width: 9999,
      height: 9999,
    };

    const restored = roundTrip(damaged)!;
    expect(restored.cells).toHaveLength(3);
    expect(restored.cells[0]).toHaveLength(3);
    expect(restored.cells[0][0].text).toBe("only");
    expect(restored.cells[2][2].text).toBe("");
    // the outer box is recomputed from the tracks, not trusted from the file
    expect(restored.width).toBe(
      restored.colWidths.reduce((sum, w) => sum + w, 0),
    );
    expect(restored.height).toBe(
      restored.rowHeights.reduce((sum, h) => sum + h, 0),
    );
  });
});
