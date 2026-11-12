import clsx from "clsx";

import {
  CUSTOM_TABLE_STYLE_ID,
  TABLE_STYLE_PRESETS,
  getTableLines,
} from "@excalidraw/element";

import type { TableStylePreset } from "@excalidraw/element";

import { t } from "../i18n";

import { palette } from "./icons";

import "./TableStylePicker.scss";

import type { TranslationKeys } from "../i18n";

const LABELS: Record<string, TranslationKeys> = {
  default: "labels.tableStyle_default",
  blue: "labels.tableStyle_blue",
  green: "labels.tableStyle_green",
  orange: "labels.tableStyle_orange",
  violet: "labels.tableStyle_violet",
  dark: "labels.tableStyle_dark",
  minimal: "labels.tableStyle_minimal",
  striped: "labels.tableStyle_striped",
};

const SWATCH = { cols: 3, rows: 4, colWidth: 12, rowHeight: 6, margin: 1 };

/** A thumbnail of a 3x4 table drawn the way the preset would draw it. */
const TableStyleSwatch = ({ preset }: { preset: TableStylePreset }) => {
  const { cols, rows, colWidth, rowHeight, margin } = SWATCH;
  const width = cols * colWidth;
  const height = rows * rowHeight;
  const boxes = Array.from({ length: rows * cols }, (_, index) => ({
    row: Math.floor(index / cols),
    x: (index % cols) * colWidth,
    y: Math.floor(index / cols) * rowHeight,
    width: colWidth,
    height: rowHeight,
  }));
  const lines = getTableLines(boxes, { width, height }, preset, true);
  const headerFill = preset.headerFill ?? "#e9ecef";
  const bandFill = preset.bandFill ?? "#f1f3f5";

  return (
    <svg
      viewBox={`${-margin} ${-margin} ${width + margin * 2} ${
        height + margin * 2
      }`}
      aria-hidden="true"
    >
      <rect width={width} height={height} fill="#ffffff" />
      {headerFill !== "transparent" && (
        <rect width={width} height={rowHeight} fill={headerFill} />
      )}
      {preset.banded && (
        <rect y={rowHeight * 2} width={width} height={rowHeight} fill={bandFill} />
      )}
      {lines.map(({ heavy, x1, y1, x2, y2 }, index) => (
        <line
          key={index}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={heavy ? "#1e1e1e" : preset.lineColor ?? "#1e1e1e"}
          strokeWidth={heavy ? 1.4 : 0.7}
        />
      ))}
      {Array.from({ length: cols }, (_, col) => (
        <line
          key={`text-${col}`}
          x1={col * colWidth + 2.5}
          x2={col * colWidth + colWidth - 3.5}
          y1={rowHeight / 2}
          y2={rowHeight / 2}
          stroke={preset.headerText ?? "#1e1e1e"}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
};

/**
 * The table style presets as a row of thumbnails to choose from, ending with
 * the custom style, drawn in the colours it would use.
 */
export const TableStylePicker = ({
  value,
  custom,
  onChange,
}: {
  /** Id of the preset in use; anything unknown reads as the default. */
  value: string | undefined;
  /** The custom preset, in the colours choosing it would give the table;
      absent leaves custom out, as when a table is not made yet. */
  custom?: TableStylePreset;
  onChange: (presetId: string) => void;
}) => {
  const current =
    value === CUSTOM_TABLE_STYLE_ID
      ? CUSTOM_TABLE_STYLE_ID
      : TABLE_STYLE_PRESETS.find((preset) => preset.id === value)?.id ??
        TABLE_STYLE_PRESETS[0].id;
  const customLabel = t("labels.tableStyle_custom");

  return (
    <div
      className="table-style-picker"
      role="radiogroup"
      aria-label={t("labels.tableStyle")}
    >
      {TABLE_STYLE_PRESETS.map((preset) => {
        const label = LABELS[preset.id] ? t(LABELS[preset.id]) : preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={preset.id === current}
            aria-label={label}
            title={label}
            data-testid={`table-style-${preset.id}`}
            className={clsx("table-style-picker__item", {
              "table-style-picker__item--active": preset.id === current,
            })}
            onClick={() => onChange(preset.id)}
          >
            <TableStyleSwatch preset={preset} />
          </button>
        );
      })}
      {custom && (
        <button
          type="button"
          role="radio"
          aria-checked={current === CUSTOM_TABLE_STYLE_ID}
          aria-label={customLabel}
          title={customLabel}
          data-testid="table-style-custom"
          className={clsx(
            "table-style-picker__item",
            "table-style-picker__item--custom",
            {
              "table-style-picker__item--active":
                current === CUSTOM_TABLE_STYLE_ID,
            },
          )}
          onClick={() => onChange(CUSTOM_TABLE_STYLE_ID)}
        >
          <TableStyleSwatch preset={custom} />
          <span className="table-style-picker__badge">{palette}</span>
        </button>
      )}
    </div>
  );
};
