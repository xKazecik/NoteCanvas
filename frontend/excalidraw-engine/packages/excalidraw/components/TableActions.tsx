import { getCell, resolveAnchorCell } from "@excalidraw/element";

import type { TableCellStyle } from "@excalidraw/element/types";

import {
  DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_PICKS,
} from "@excalidraw/common";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { t } from "../i18n";

import { ColorPicker } from "./ColorPicker/ColorPicker";
import { ToolButton } from "./ToolButton";
import { RadioSelection } from "./RadioSelection";
import {
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  FontSizeSmallIcon,
  FontSizeMediumIcon,
  FontSizeLargeIcon,
  BoldIcon,
  ItalicIcon,
  TableAddRowIcon,
  TableAddColumnIcon,
  TableDeleteRowIcon,
  TableDeleteColumnIcon,
  TableMergeIcon,
  TableUnmergeIcon,
  TableHeaderIcon,
  TableBandingIcon,
} from "./icons";

import type { TableOperation } from "../actions/actionTable";
import type { getTableTarget } from "../actions/actionTable";
import type { AppState } from "../types";

type Target = NonNullable<ReturnType<typeof getTableTarget>>;

/**
 * The table panel. Structural buttons act on the anchor cell; the formatting
 * controls act on the whole selected range, which is why the style controls are
 * disabled until the user has clicked into the table.
 */
export const TableActions = ({
  target,
  elements,
  appState,
  updateData,
}: {
  target: Target;
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  /** Takes a table operation, or a plain appState patch for the colour popup. */
  updateData: (data: TableOperation | Partial<AppState>) => void;
}) => {
  const { table, selection } = target;
  const hasSelection = !!selection;

  const anchor = selection
    ? resolveAnchorCell(table, selection.anchor.row, selection.anchor.col)
    : null;
  const anchorCell = anchor ? getCell(table, anchor.row, anchor.col) : null;
  const isMerged =
    !!anchorCell &&
    ((anchorCell.colSpan ?? 1) > 1 || (anchorCell.rowSpan ?? 1) > 1);
  const style: TableCellStyle = anchorCell?.style ?? {};

  const setStyle = (patch: TableCellStyle) =>
    updateData({ op: "styleCells", style: patch });

  return (
    <>
      <fieldset>
        <legend>{t("labels.tableStructure")}</legend>
        <div className="buttonList">
          <ToolButton
            type="button"
            icon={TableAddRowIcon}
            title={t("labels.insertRowBelow")}
            aria-label={t("labels.insertRowBelow")}
            onClick={() => updateData({ op: "insertRow", before: false })}
          />
          <ToolButton
            type="button"
            icon={TableAddColumnIcon}
            title={t("labels.insertColumnAfter")}
            aria-label={t("labels.insertColumnAfter")}
            onClick={() => updateData({ op: "insertColumn", before: false })}
          />
          <ToolButton
            type="button"
            icon={TableDeleteRowIcon}
            title={t("labels.deleteRow")}
            aria-label={t("labels.deleteRow")}
            onClick={() => updateData({ op: "deleteRow" })}
          />
          <ToolButton
            type="button"
            icon={TableDeleteColumnIcon}
            title={t("labels.deleteColumn")}
            aria-label={t("labels.deleteColumn")}
            onClick={() => updateData({ op: "deleteColumn" })}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t("labels.tableStyle")}</legend>
        <div className="buttonList">
          <ToolButton
            type="button"
            icon={TableHeaderIcon}
            title={t("labels.headerRow")}
            aria-label={t("labels.headerRow")}
            selected={table.headerRow}
            onClick={() => updateData({ op: "toggleHeaderRow" })}
          />
          <ToolButton
            type="button"
            icon={TableBandingIcon}
            title={t("labels.bandedRows")}
            aria-label={t("labels.bandedRows")}
            selected={table.bandedRows}
            onClick={() => updateData({ op: "toggleBandedRows" })}
          />
          <ToolButton
            type="button"
            icon={isMerged ? TableUnmergeIcon : TableMergeIcon}
            title={isMerged ? t("labels.unmergeCells") : t("labels.mergeCells")}
            aria-label={
              isMerged ? t("labels.unmergeCells") : t("labels.mergeCells")
            }
            onClick={() => updateData({ op: isMerged ? "unmerge" : "merge" })}
          />
        </div>
      </fieldset>

      {hasSelection && (
        <>
          <fieldset>
            <legend>{t("labels.cellBackground")}</legend>
            <ColorPicker
              type="elementBackground"
              topPicks={DEFAULT_ELEMENT_BACKGROUND_PICKS}
              palette={DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE}
              label={t("labels.cellBackground")}
              color={style.backgroundColor ?? "transparent"}
              onChange={(color) => setStyle({ backgroundColor: color })}
              elements={elements}
              appState={appState}
              updateData={updateData}
            />
          </fieldset>

          <fieldset>
            <legend>{t("labels.cellText")}</legend>
            <div className="buttonList">
              <ToolButton
                type="button"
                icon={BoldIcon}
                title={t("labels.bold")}
                aria-label={t("labels.bold")}
                selected={!!style.bold}
                onClick={() => setStyle({ bold: !style.bold })}
              />
              <ToolButton
                type="button"
                icon={ItalicIcon}
                title={t("labels.italic")}
                aria-label={t("labels.italic")}
                selected={!!style.italic}
                onClick={() => setStyle({ italic: !style.italic })}
              />
            </div>
            <div className="buttonList">
              <RadioSelection<NonNullable<TableCellStyle["textAlign"]>>
                group="table-cell-align"
                options={[
                  {
                    value: "left",
                    text: t("labels.left"),
                    icon: TextAlignLeftIcon,
                  },
                  {
                    value: "center",
                    text: t("labels.center"),
                    icon: TextAlignCenterIcon,
                  },
                  {
                    value: "right",
                    text: t("labels.right"),
                    icon: TextAlignRightIcon,
                  },
                ]}
                value={style.textAlign ?? "left"}
                onChange={(textAlign) => setStyle({ textAlign })}
              />
            </div>
            <div className="buttonList">
              <RadioSelection<number>
                group="table-cell-font-size"
                options={[
                  {
                    value: 16,
                    text: t("labels.small"),
                    icon: FontSizeSmallIcon,
                  },
                  {
                    value: 20,
                    text: t("labels.medium"),
                    icon: FontSizeMediumIcon,
                  },
                  {
                    value: 28,
                    text: t("labels.large"),
                    icon: FontSizeLargeIcon,
                  },
                ]}
                value={style.fontSize ?? 20}
                onChange={(fontSize) => setStyle({ fontSize })}
              />
            </div>
          </fieldset>
        </>
      )}
    </>
  );
};
