import {
  CaptureUpdateAction,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  isTableElement,
  mergeCells,
  newElementWith,
  normalizeRange,
  unmergeCells,
} from "@excalidraw/element";

import type { TablePatch } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawTableElement,
  TableCellStyle,
} from "@excalidraw/element/types";

import { TableActions } from "../components/TableActions";

import { register } from "./register";

import type { AppState } from "../types";

/** Everything the table panel can ask for, as one discriminated payload. */
export type TableOperation =
  | { op: "insertRow"; before: boolean }
  | { op: "insertColumn"; before: boolean }
  | { op: "deleteRow" }
  | { op: "deleteColumn" }
  | { op: "merge" }
  | { op: "unmerge" }
  | { op: "toggleHeaderRow" }
  | { op: "toggleBandedRows" }
  | { op: "styleCells"; style: TableCellStyle };

type Selection = NonNullable<AppState["selectedTableCells"]>;

/** The table the panel is pointed at, plus its selected range. */
export const getTableTarget = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
): { table: ExcalidrawTableElement; selection: Selection | null } | null => {
  const selected = elements.filter(
    (element) => appState.selectedElementIds[element.id] && !element.isDeleted,
  );
  if (selected.length !== 1 || !isTableElement(selected[0])) {
    return null;
  }
  const table = selected[0];
  const selection =
    appState.selectedTableCells?.elementId === table.id
      ? appState.selectedTableCells
      : null;
  return { table, selection };
};

/** Merge a style patch into every cell in the selected range. */
const styleRange = (
  table: ExcalidrawTableElement,
  selection: Selection,
  style: TableCellStyle,
): Pick<ExcalidrawTableElement, "cells"> => {
  const { top, left, bottom, right } = normalizeRange(
    table,
    selection.anchor,
    selection.focus,
  );
  const cells = table.cells.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (
        rowIndex < top ||
        rowIndex > bottom ||
        colIndex < left ||
        colIndex > right
      ) {
        return cell;
      }
      return { ...cell, style: { ...cell.style, ...style } };
    }),
  );
  return { cells };
};

const applyOperation = (
  table: ExcalidrawTableElement,
  selection: Selection | null,
  operation: TableOperation,
): Partial<ExcalidrawTableElement> | null => {
  // structural edits act on the anchor cell, or the first cell when the user
  // has not picked one yet
  const at = selection?.anchor ?? { row: 0, col: 0 };

  const structural = (patch: TablePatch | null) => patch;

  switch (operation.op) {
    case "insertRow":
      return structural(insertRow(table, operation.before ? at.row : at.row + 1));
    case "insertColumn":
      return structural(
        insertColumn(table, operation.before ? at.col : at.col + 1),
      );
    case "deleteRow":
      return structural(deleteRow(table, at.row));
    case "deleteColumn":
      return structural(deleteColumn(table, at.col));
    case "merge":
      return selection
        ? structural(mergeCells(table, selection.anchor, selection.focus))
        : null;
    case "unmerge":
      return selection ? structural(unmergeCells(table, at)) : null;
    case "toggleHeaderRow":
      return { headerRow: !table.headerRow };
    case "toggleBandedRows":
      return { bandedRows: !table.bandedRows };
    case "styleCells":
      return selection ? styleRange(table, selection, operation.style) : null;
    default:
      return null;
  }
};

export const actionTableOperation = register({
  name: "tableOperation",
  label: "labels.table",
  trackEvent: false,
  predicate: (elements, appState) => !!getTableTarget(elements, appState),
  perform: (elements, appState, value, app) => {
    // The panel's colour picker drives its popup through the same updateData
    // channel, so anything that is not a table operation is a plain appState
    // patch and is passed straight through.
    if (!value || typeof value !== "object" || !("op" in value)) {
      return {
        appState: { ...appState, ...(value as Partial<AppState>) },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }
    const operation = value as TableOperation;

    const target = getTableTarget(elements, app.state);
    if (!target) {
      return { elements, appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }

    const update = applyOperation(target.table, target.selection, operation);
    if (!update) {
      return { elements, appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }

    const next = elements.map((element) =>
      element.id === target.table.id
        ? newElementWith(
            element,
            update as Parameters<typeof newElementWith>[1],
          )
        : element,
    );

    // a structural change can move or remove the selected cell, so the range
    // collapses back to the anchor and is clamped into the new grid
    const resized = update as Partial<ExcalidrawTableElement>;
    const rows = resized.rowHeights?.length ?? target.table.rowHeights.length;
    const cols = resized.colWidths?.length ?? target.table.colWidths.length;
    const anchor = target.selection?.anchor ?? { row: 0, col: 0 };
    const clamped = {
      row: Math.min(anchor.row, rows - 1),
      col: Math.min(anchor.col, cols - 1),
    };

    return {
      elements: next,
      appState: {
        ...appState,
        selectedTableCells: {
          elementId: target.table.id,
          anchor: clamped,
          focus:
            operation.op === "styleCells" && target.selection
              ? target.selection.focus
              : clamped,
        },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => {
    const target = getTableTarget(elements, app.state);
    if (!target) {
      return null;
    }
    return (
      <TableActions
        target={target}
        elements={elements}
        appState={appState}
        updateData={updateData}
      />
    );
  },
});
