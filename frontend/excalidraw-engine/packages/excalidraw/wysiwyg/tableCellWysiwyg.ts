import { KEYS, getFontFamilyString } from "@excalidraw/common";

import {
  TABLE_DEFAULTS,
  getCellBox,
  resolveAnchorCell,
  resolveCellStyle,
  getTableTints,
  tableColumnCount,
  tableRowCount,
} from "@excalidraw/element";

import type { CellPosition } from "@excalidraw/element";
import type { ExcalidrawTableElement, Theme } from "@excalidraw/element/types";

export type TableCellEditorHandle = {
  /** Commit whatever is in the box and tear the editor down. */
  submit: () => void;
  /** The cell currently being edited. */
  cell: CellPosition;
  elementId: string;
};

/**
 * Where to go when Tab or an arrow key leaves the current cell. Skips slots
 * hidden behind a merge so tabbing never lands on an uneditable cell.
 */
const step = (
  element: ExcalidrawTableElement,
  from: CellPosition,
  direction: "next" | "prev" | "up" | "down",
): CellPosition | null => {
  const rows = tableRowCount(element);
  const cols = tableColumnCount(element);
  let { row, col } = from;

  for (let guard = 0; guard < rows * cols; guard++) {
    if (direction === "next") {
      col += 1;
      if (col >= cols) {
        col = 0;
        row += 1;
      }
    } else if (direction === "prev") {
      col -= 1;
      if (col < 0) {
        col = cols - 1;
        row -= 1;
      }
    } else {
      row += direction === "down" ? 1 : -1;
    }

    if (row < 0 || row >= rows || col < 0 || col >= cols) {
      return null;
    }
    const anchor = resolveAnchorCell(element, row, col);
    if (anchor && (anchor.row !== from.row || anchor.col !== from.col)) {
      return anchor;
    }
  }
  return null;
};

/**
 * Mounts a textarea over one table cell.
 *
 * Follows the same shape as `textWysiwyg`: a plain DOM node parented to the
 * editor's text-editor container, positioned from scene coordinates each time
 * the viewport moves, and torn down on submit.
 */
export const tableCellWysiwyg = ({
  element,
  cell,
  theme,
  excalidrawContainer,
  getViewportCoords,
  getZoom,
  onChange,
  onSubmit,
  onMove,
}: {
  element: ExcalidrawTableElement;
  cell: CellPosition;
  theme: Theme;
  excalidrawContainer: HTMLDivElement | null;
  getViewportCoords: (x: number, y: number) => [number, number];
  getZoom: () => number;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onMove: (next: CellPosition) => void;
}): TableCellEditorHandle | null => {
  const box = getCellBox(element, cell.row, cell.col);
  const host = excalidrawContainer?.querySelector(
    ".excalidraw-textEditorContainer",
  );
  if (!box || !host) {
    return null;
  }

  const style = resolveCellStyle(element, cell.row, cell.col, {
    headerColor: getTableTints(theme).header,
    bandingColor: getTableTints(theme).banding,
  });

  const editable = document.createElement("textarea");
  editable.dir = "auto";
  editable.tabIndex = 0;
  editable.dataset.type = "table-cell";
  editable.wrap = "soft";
  editable.value = element.cells[cell.row]?.[cell.col]?.text ?? "";
  editable.classList.add("excalidraw-wysiwyg");

  let submitted = false;

  const position = () => {
    const zoom = getZoom();
    const padding = TABLE_DEFAULTS.cellPadding;
    // the cell's corner has to be rotated about the element's centre before it
    // is projected, because the canvas painter draws the table rotated too
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const cornerX = element.x + box.x;
    const cornerY = element.y + box.y;
    const cos = Math.cos(element.angle);
    const sin = Math.sin(element.angle);
    const [viewportX, viewportY] = getViewportCoords(
      centerX + (cornerX - centerX) * cos - (cornerY - centerY) * sin,
      centerY + (cornerX - centerX) * sin + (cornerY - centerY) * cos,
    );
    Object.assign(editable.style, {
      position: "absolute",
      left: `${viewportX}px`,
      top: `${viewportY}px`,
      width: `${box.width * zoom}px`,
      height: `${box.height * zoom}px`,
      padding: `${padding * zoom}px`,
      margin: "0",
      border: "0",
      outline: `${Math.max(1, zoom)}px solid var(--color-primary)`,
      resize: "none",
      overflow: "hidden",
      boxSizing: "border-box",
      background: "var(--island-bg-color)",
      color: style.textColor,
      fontFamily: getFontFamilyString(style),
      fontSize: `${style.fontSize * zoom}px`,
      fontWeight: style.bold ? "bold" : "normal",
      fontStyle: style.italic ? "italic" : "normal",
      lineHeight: "1.25",
      textAlign: style.textAlign,
      transform: `rotate(${element.angle}rad)`,
      transformOrigin: "top left",
      zIndex: "var(--zIndex-wysiwyg)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    });
  };

  /** Detach and commit. Returns false if the editor was already torn down. */
  const teardown = () => {
    if (submitted) {
      return false;
    }
    submitted = true;
    window.removeEventListener("pointerdown", onPointerDown, {
      capture: true,
    });
    window.removeEventListener("resize", position);
    window.removeEventListener("beforeunload", submit);
    const text = editable.value;
    editable.remove();
    onSubmit(text);
    return true;
  };

  const submit = () => {
    teardown();
  };

  function onPointerDown(event: PointerEvent) {
    if (event.target !== editable) {
      submit();
    }
  }

  const moveTo = (direction: "next" | "prev" | "up" | "down") => {
    const target = step(element, cell, direction);
    if (teardown() && target) {
      onMove(target);
    }
  };

  editable.oninput = () => onChange(editable.value);

  editable.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      submit();
    } else if (event.key === KEYS.TAB) {
      event.preventDefault();
      moveTo(event.shiftKey ? "prev" : "next");
    } else if (event.key === KEYS.ENTER && !event.shiftKey) {
      // Shift+Enter inserts a newline, plain Enter moves down like a spreadsheet
      event.preventDefault();
      moveTo("down");
    }
  };

  editable.onpointerdown = (event) => event.stopPropagation();

  position();
  host.appendChild(editable);
  editable.focus();
  editable.select();

  requestAnimationFrame(() => {
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
  });
  window.addEventListener("resize", position);
  window.addEventListener("beforeunload", submit);

  return { submit, cell, elementId: element.id };
};
