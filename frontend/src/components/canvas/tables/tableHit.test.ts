import { describe, expect, it } from "vitest";
import {
  getTableAddHandleAtLocalPoint,
  hitElementItself,
  isFilledShape,
  newElement,
  newTableElement,
} from "@excalidraw/element";

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

describe("isFilledShape", () => {
  const rectangle = (backgroundColor: string) =>
    newElement({ type: "rectangle", x: 0, y: 0, backgroundColor });

  it("is true only for a closed shape with a visible fill", () => {
    expect(isFilledShape(rectangle("#ffc9c9"))).toBe(true);
    expect(isFilledShape(rectangle("transparent"))).toBe(false);
    expect(
      isFilledShape(newTableElement({ x: 0, y: 0, backgroundColor: "#fff" })),
    ).toBe(false);
  });
});

describe("the add-row and add-column buttons", () => {
  const table = newTableElement({ x: 0, y: 0, rows: 2, cols: 2 });

  it("sit just outside the right and bottom edge", () => {
    expect(
      getTableAddHandleAtLocalPoint(table, table.width + 22, table.height / 2, 1)
        ?.kind,
    ).toBe("col");
    expect(
      getTableAddHandleAtLocalPoint(table, table.width / 2, table.height + 22, 1)
        ?.kind,
    ).toBe("row");
  });

  it("are not hit from inside the table", () => {
    expect(
      getTableAddHandleAtLocalPoint(table, table.width - 5, table.height / 2, 1),
    ).toBeNull();
  });

  it("keep their on-screen size when zoomed out", () => {
    // at 50% zoom the button is twice as far out in scene units
    expect(
      getTableAddHandleAtLocalPoint(table, table.width + 44, table.height / 2, 0.5)
        ?.kind,
    ).toBe("col");
    expect(
      getTableAddHandleAtLocalPoint(table, table.width + 22, table.height / 2, 0.5),
    ).toBeNull();
  });
});
