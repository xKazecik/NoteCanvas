import {
  CaptureUpdateAction,
  clearCells,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  isTableElement,
  mergeCells,
  newElementWith,
  normalizeRange,
  sortRowsByColumn,
  unmergeCells,
} from "@excalidraw/element";

import type { CellPosition, CellRange } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawTableElement,
  TableCellStyle,
} from "@excalidraw/element/types";

import { TableActions } from "../components/TableActions";
import { t } from "../i18n";

import { register } from "./register";

import type { ActionName, ActionResult } from "./types";
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
  | { op: "styleCells"; style: TableCellStyle }
  | { op: "clearCells" }
  | { op: "sort"; direction: "asc" | "desc" };

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

/** The selected rectangle, or just the first cell when nothing is picked. */
const getRange = (
  table: ExcalidrawTableElement,
  selection: Selection | null,
): CellRange =>
  selection
    ? normalizeRange(table, selection.anchor, selection.focus)
    : { top: 0, left: 0, bottom: 0, right: 0 };

/** The selected rectangle plus each Ctrl+clicked cell, as separate ranges. */
const getPickedRanges = (
  table: ExcalidrawTableElement,
  selection: Selection,
): CellRange[] => [
  normalizeRange(table, selection.anchor, selection.focus),
  ...(selection.extra ?? []).map((cell) => normalizeRange(table, cell, cell)),
];

/** Merge a style patch into every cell in the picked ranges. */
const styleRanges = (
  table: ExcalidrawTableElement,
  ranges: readonly CellRange[],
  style: TableCellStyle,
): Pick<ExcalidrawTableElement, "cells"> => {
  const cells = table.cells.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      const picked = ranges.some(
        (range) =>
          rowIndex >= range.top &&
          rowIndex <= range.bottom &&
          colIndex >= range.left &&
          colIndex <= range.right,
      );
      return picked ? { ...cell, style: { ...cell.style, ...style } } : cell;
    }),
  );
  return { cells };
};

type OperationResult = {
  update: Partial<ExcalidrawTableElement>;
  /** Where the cell selection lands afterwards; defaults to the anchor. */
  select?: CellPosition;
  /** Keep the whole range selected rather than collapsing it. */
  keepRange?: boolean;
};

const applyOperation = (
  table: ExcalidrawTableElement,
  selection: Selection | null,
  operation: TableOperation,
): OperationResult | null => {
  // structural edits act on the selected range, or the first cell when the
  // user has not picked one yet
  const range = getRange(table, selection);
  const at = selection?.anchor ?? { row: 0, col: 0 };

  const withUpdate = (
    update: Partial<ExcalidrawTableElement> | null,
    rest: Omit<OperationResult, "update"> = {},
  ) => (update ? { update, ...rest } : null);

  switch (operation.op) {
    case "insertRow": {
      // the new row is selected so the user can start typing into it
      const row = operation.before ? range.top : range.bottom + 1;
      return withUpdate(insertRow(table, row), {
        select: { row, col: range.left },
      });
    }
    case "insertColumn": {
      const col = operation.before ? range.left : range.right + 1;
      return withUpdate(insertColumn(table, col), {
        select: { row: range.top, col },
      });
    }
    case "deleteRow":
      return withUpdate(
        deleteRow(table, range.top, range.bottom - range.top + 1),
        { select: { row: range.top, col: range.left } },
      );
    case "deleteColumn":
      return withUpdate(
        deleteColumn(table, range.left, range.right - range.left + 1),
        { select: { row: range.top, col: range.left } },
      );
    case "merge":
      return selection
        ? withUpdate(mergeCells(table, selection.anchor, selection.focus))
        : null;
    case "unmerge":
      return selection ? withUpdate(unmergeCells(table, at)) : null;
    case "toggleHeaderRow":
      return withUpdate({ headerRow: !table.headerRow }, { keepRange: true });
    case "toggleBandedRows":
      return withUpdate({ bandedRows: !table.bandedRows }, { keepRange: true });
    case "styleCells":
      return selection
        ? withUpdate(
            styleRanges(
              table,
              getPickedRanges(table, selection),
              operation.style,
            ),
            { keepRange: true },
          )
        : null;
    case "clearCells":
      return selection
        ? withUpdate(
            getPickedRanges(table, selection).reduce(
              (cleared, picked) => clearCells({ ...table, ...cleared }, picked),
              { cells: table.cells },
            ),
            { keepRange: true },
          )
        : null;
    case "sort":
      return withUpdate(
        sortRowsByColumn(table, at.col, operation.direction),
        { keepRange: true },
      );
    default:
      return null;
  }
};

/**
 * Run one table operation against the selected table. Shared by the panel,
 * the context menu entries and the keyboard handling in App.
 */
export const performTableOperation = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  operation: TableOperation,
): ActionResult => {
  const target = getTableTarget(elements, appState);
  if (!target || target.table.locked) {
    return { elements, appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
  }

  const result = applyOperation(target.table, target.selection, operation);
  if (!result) {
    // a sort is only refused over merges; say why rather than doing nothing
    const sortBlocked =
      operation.op === "sort" &&
      target.table.cells.some((row) => row.some((cell) => cell.spannedBy));
    return {
      elements,
      appState: sortBlocked
        ? {
            ...appState,
            toast: { message: t("toast.tableSortMerged"), closable: true },
          }
        : appState,
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  }
  const { update } = result;

  const next = elements.map((element) =>
    element.id === target.table.id
      ? newElementWith(element, update as Parameters<typeof newElementWith>[1])
      : element,
  );

  // a structural change can move or remove the selected cell, so the range
  // collapses to a single cell clamped into the new grid
  const rows = update.rowHeights?.length ?? target.table.rowHeights.length;
  const cols = update.colWidths?.length ?? target.table.colWidths.length;
  const clamp = (cell: CellPosition) => ({
    row: Math.min(cell.row, rows - 1),
    col: Math.min(cell.col, cols - 1),
  });
  const anchor = clamp(
    result.select ?? target.selection?.anchor ?? { row: 0, col: 0 },
  );
  const focus =
    result.keepRange && target.selection
      ? clamp(target.selection.focus)
      : anchor;

  // Ctrl+clicked cells survive edits that leave the grid's shape alone
  const extra =
    result.keepRange && !update.rowHeights && !update.colWidths
      ? target.selection?.extra
      : undefined;

  return {
    elements: next,
    appState: {
      ...appState,
      selectedTableCells: {
        elementId: target.table.id,
        anchor,
        focus,
        ...(extra?.length ? { extra } : {}),
      },
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
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
    return performTableOperation(
      elements,
      { ...appState, selectedTableCells: app.state.selectedTableCells },
      value as TableOperation,
    );
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

/** A context-menu entry that runs one fixed table operation. */
const tableMenuAction = (
  name: ActionName,
  label: string,
  operation: TableOperation,
) =>
  register({
    name,
    label,
    trackEvent: false,
    predicate: (elements, appState) => {
      const target = getTableTarget(elements, appState);
      return !!target && !target.table.locked && !appState.viewModeEnabled;
    },
    perform: (elements, appState) =>
      performTableOperation(elements, appState, operation),
  });

export const actionTableInsertRowAbove = tableMenuAction(
  "tableInsertRowAbove",
  "labels.insertRowAbove",
  { op: "insertRow", before: true },
);
export const actionTableInsertRowBelow = tableMenuAction(
  "tableInsertRowBelow",
  "labels.insertRowBelow",
  { op: "insertRow", before: false },
);
export const actionTableInsertColumnLeft = tableMenuAction(
  "tableInsertColumnLeft",
  "labels.insertColumnBefore",
  { op: "insertColumn", before: true },
);
export const actionTableInsertColumnRight = tableMenuAction(
  "tableInsertColumnRight",
  "labels.insertColumnAfter",
  { op: "insertColumn", before: false },
);
export const actionTableDeleteRow = tableMenuAction(
  "tableDeleteRow",
  "labels.deleteRow",
  { op: "deleteRow" },
);
export const actionTableDeleteColumn = tableMenuAction(
  "tableDeleteColumn",
  "labels.deleteColumn",
  { op: "deleteColumn" },
);
export const actionTableClearCells = tableMenuAction(
  "tableClearCells",
  "labels.clearCells",
  { op: "clearCells" },
);
export const actionTableSortAscending = tableMenuAction(
  "tableSortAscending",
  "labels.sortAscending",
  { op: "sort", direction: "asc" },
);
export const actionTableSortDescending = tableMenuAction(
  "tableSortDescending",
  "labels.sortDescending",
  { op: "sort", direction: "desc" },
);
