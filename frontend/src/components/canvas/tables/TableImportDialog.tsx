import { useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Dialog,
  FilledButton,
  newTableElement,
  syncInvalidIndices,
  tableFromRows,
  useUIAppState,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  IMPORT_MAX_COLS,
  IMPORT_MAX_ROWS,
  TABLE_IMPORT_ACCEPT,
  normalizeRows,
  parseDelimitedText,
  readTableFile,
} from "./tableImport";
import type { ImportedSheet, TableRows } from "./tableImport";

import "./TableImportDialog.css";

const PREVIEW_ROWS = 6;
const PREVIEW_COLS = 8;

/** Put a table holding `rows` in the middle of the view and select it. */
const insertTable = (
  api: ExcalidrawImperativeAPI,
  rows: TableRows,
  headerRow: boolean,
) => {
  const appState = api.getAppState();
  const layout = tableFromRows(rows);
  const width = layout.colWidths.reduce((sum, size) => sum + size, 0);
  const height = layout.rowHeights.reduce((sum, size) => sum + size, 0);
  const viewWidth = appState.width / appState.zoom.value;
  const viewHeight = appState.height / appState.zoom.value;

  const table = newTableElement({
    x: -appState.scrollX + (viewWidth - width) / 2,
    y: -appState.scrollY + (viewHeight - height) / 2,
    ...layout,
    headerRow,
    strokeColor: appState.currentItemStrokeColor,
    backgroundColor: "transparent",
    fillStyle: appState.currentItemFillStyle,
    strokeWidth: appState.currentItemStrokeWidth,
    strokeStyle: appState.currentItemStrokeStyle,
    roughness: appState.currentItemRoughness,
    opacity: appState.currentItemOpacity,
    roundness: null,
    locked: false,
  });

  api.updateScene({
    // a new element has no z-order index yet; give it the next one
    elements: syncInvalidIndices([
      ...api.getSceneElementsIncludingDeleted(),
      table,
    ]),
    appState: { openDialog: null, selectedElementIds: { [table.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  if (width > viewWidth || height > viewHeight) {
    api.scrollToContent(table, {
      fitToViewport: true,
      viewportZoomFactor: 0.9,
      animate: true,
    });
  }
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const ImportForm = ({
  excalidrawAPI,
  onClose,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onClose: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<ImportedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [headerRow, setHeaderRow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { rows, truncated } = useMemo(
    () => normalizeRows(sheets[sheetIndex]?.rows ?? []),
    [sheets, sheetIndex],
  );
  const columnCount = rows[0]?.length ?? 0;

  const loadFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    try {
      const loaded = await readTableFile(file);
      setSheets(loaded);
      setSheetIndex(0);
      setFileName(file.name);
      setPasted("");
      setError(null);
    } catch (err) {
      setSheets([]);
      setFileName(null);
      setError(
        err instanceof Error ? err.message : "This file could not be read.",
      );
    }
  };

  const loadPasted = (text: string) => {
    setPasted(text);
    setFileName(null);
    setSheetIndex(0);
    setError(null);
    const parsed = parseDelimitedText(text);
    setSheets(parsed.length ? [{ name: "Pasted", rows: parsed }] : []);
  };

  return (
    <div className="notecanvas-table-import">
      <div
        className={
          isDragOver
            ? "notecanvas-table-import__drop notecanvas-table-import__drop--over"
            : "notecanvas-table-import__drop"
        }
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragOver(false);
          void loadFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={TABLE_IMPORT_ACCEPT}
          hidden
          data-testid="table-import-file"
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
            // let the same file be picked again after an error
            event.target.value = "";
          }}
        />
        {fileName ? (
          <span className="notecanvas-table-import__file">{fileName}</span>
        ) : (
          <span>Drop a file here, or</span>
        )}
        <FilledButton
          variant="outlined"
          color="primary"
          label={fileName ? "Choose another file" : "Choose file"}
          onClick={() => fileInputRef.current?.click()}
        />
        <span className="notecanvas-table-import__hint">
          CSV, TSV, Excel (.xlsx) or OpenDocument (.ods)
        </span>
      </div>

      {sheets.length > 1 && (
        <label className="notecanvas-table-import__field">
          Sheet
          <select
            value={sheetIndex}
            onChange={(event) => setSheetIndex(Number(event.target.value))}
          >
            {sheets.map((sheet, index) => (
              <option key={index} value={index}>
                {sheet.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="notecanvas-table-import__field">
        Or paste the data
        <textarea
          value={pasted}
          rows={4}
          spellCheck={false}
          placeholder={
            "Paste cells copied from a spreadsheet, or CSV text:\nName,Qty\nApples,3"
          }
          data-testid="table-import-paste"
          onChange={(event) => loadPasted(event.target.value)}
        />
      </label>

      <label className="notecanvas-table-import__check">
        <input
          type="checkbox"
          checked={headerRow}
          onChange={(event) => setHeaderRow(event.target.checked)}
        />
        The first row is a header
      </label>

      {error && (
        <p className="notecanvas-table-import__error" role="alert">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="notecanvas-table-import__preview">
          <div className="notecanvas-table-import__summary">
            {plural(rows.length, "row")} × {plural(columnCount, "column")}
            {truncated &&
              ` (cut to the first ${IMPORT_MAX_ROWS} rows and ${IMPORT_MAX_COLS} columns)`}
          </div>
          <div className="notecanvas-table-import__scroll">
            <table>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={
                      headerRow && rowIndex === 0
                        ? "notecanvas-table-import__header"
                        : undefined
                    }
                  >
                    {row.slice(0, PREVIEW_COLS).map((cell, colIndex) => (
                      <td key={colIndex}>{cell}</td>
                    ))}
                    {columnCount > PREVIEW_COLS && <td>…</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW_ROWS && (
            <div className="notecanvas-table-import__hint">
              and {plural(rows.length - PREVIEW_ROWS, "more row")}
            </div>
          )}
        </div>
      )}

      <div className="notecanvas-table-import__actions">
        <FilledButton
          variant="outlined"
          color="muted"
          label="Cancel"
          onClick={onClose}
        />
        <FilledButton
          label="Import table"
          onClick={() => {
            if (rows.length) {
              insertTable(excalidrawAPI, rows, headerRow);
            } else {
              setError("Choose a file or paste some data first.");
            }
          }}
        />
      </div>
    </div>
  );
};

/**
 * Opened from the table tool in the toolbar (double-click it). Mounted inside
 * <Excalidraw>, which is what flags it open through `openDialog`.
 */
export const TableImportDialog = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const isOpen = useUIAppState().openDialog?.name === "tableImport";
  if (!isOpen) {
    return null;
  }
  const close = () =>
    excalidrawAPI.updateScene({ appState: { openDialog: null } });

  return (
    <Dialog onCloseRequest={close} title="Import table" size="small">
      <ImportForm excalidrawAPI={excalidrawAPI} onClose={close} />
    </Dialog>
  );
};
