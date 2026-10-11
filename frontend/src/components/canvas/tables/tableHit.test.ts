import { describe, expect, it } from "vitest";
import { hitElementItself, newTableElement } from "@excalidraw/element";

import type { GlobalPoint } from "@excalidraw/math";
import type { ElementsMap } from "@excalidraw/element/types";

describe("clicking a table", () => {
  // tables are inserted with no fill, which used to make only the outer
  // border clickable
  const table = newTableElement({
    x: 100,
    y: 100,
    backgroundColor: "transparent",
  });
  const elementsMap = new Map([[table.id, table]]) as unknown as ElementsMap;
  const hit = (x: number, y: number) =>
    hitElementItself({
      // a GlobalPoint is a plain [x, y] tuple
      point: [x, y] as GlobalPoint,
      element: table,
      threshold: 1,
      elementsMap,
    });

  it("hits the table from inside a cell", () => {
    expect(hit(100 + table.width / 2, 100 + table.height / 2)).toBe(true);
    expect(hit(110, 110)).toBe(true);
  });

  it("does not hit the table from outside it", () => {
    expect(hit(100 + table.width + 50, 100 + table.height + 50)).toBe(false);
  });
});
