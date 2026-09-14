import type { CSSProperties } from "react";

/**
 * The preset colours a collection can be tagged with.
 *
 * A collection may instead store a `#rrggbb` hex, which has no preset classes
 * and is rendered through inline styles -- see getCollectionColorStyle.
 *
 * The names here must stay in step with COLLECTION_COLORS in
 * backend/src/routes/dashboard/collections.ts, which rejects anything else.
 *
 * Class strings are written out in full rather than composed, because Tailwind
 * scans source text and would drop classes it never sees spelled out.
 */
export const COLLECTION_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type CollectionColor = (typeof COLLECTION_COLORS)[number];

type ColorStyle = {
  /** Card surface. */
  card: string;
  /** The swatch dot in the picker. */
  swatch: string;
  /** Folder icon. */
  icon: string;
  /**
   * Inline equivalents, set only for custom hex colours. Tailwind cannot ship
   * a class per arbitrary colour, so those are painted through style props;
   * consumers spread these alongside the class names above.
   */
  cardStyle?: CSSProperties;
  swatchStyle?: CSSProperties;
  iconStyle?: CSSProperties;
};

const DEFAULT_STYLE: ColorStyle = {
  card: "bg-white dark:bg-neutral-900 border-black dark:border-neutral-700",
  swatch: "bg-slate-200 dark:bg-neutral-700",
  icon: "text-slate-400 dark:text-neutral-500",
};

const STYLES: Record<CollectionColor, ColorStyle> = {
  slate: {
    card: "bg-slate-100 dark:bg-slate-800/50 border-slate-500 dark:border-slate-600",
    swatch: "bg-slate-400",
    icon: "text-slate-600 dark:text-slate-300",
  },
  red: {
    card: "bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-700",
    swatch: "bg-red-500",
    icon: "text-red-600 dark:text-red-400",
  },
  orange: {
    card: "bg-orange-50 dark:bg-orange-900/20 border-orange-500 dark:border-orange-700",
    swatch: "bg-orange-500",
    icon: "text-orange-600 dark:text-orange-400",
  },
  amber: {
    card: "bg-amber-50 dark:bg-amber-900/20 border-amber-500 dark:border-amber-700",
    swatch: "bg-amber-500",
    icon: "text-amber-600 dark:text-amber-400",
  },
  green: {
    card: "bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-700",
    swatch: "bg-green-500",
    icon: "text-green-600 dark:text-green-400",
  },
  teal: {
    card: "bg-teal-50 dark:bg-teal-900/20 border-teal-500 dark:border-teal-700",
    swatch: "bg-teal-500",
    icon: "text-teal-600 dark:text-teal-400",
  },
  blue: {
    card: "bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-700",
    swatch: "bg-blue-500",
    icon: "text-blue-600 dark:text-blue-400",
  },
  violet: {
    card: "bg-violet-50 dark:bg-violet-900/20 border-violet-500 dark:border-violet-700",
    swatch: "bg-violet-500",
    icon: "text-violet-600 dark:text-violet-400",
  },
  pink: {
    card: "bg-pink-50 dark:bg-pink-900/20 border-pink-500 dark:border-pink-700",
    swatch: "bg-pink-500",
    icon: "text-pink-600 dark:text-pink-400",
  },
};

const isCollectionColor = (value: unknown): value is CollectionColor =>
  typeof value === "string" &&
  (COLLECTION_COLORS as readonly string[]).includes(value);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** True for a free-form `#rrggbb` colour rather than one of the presets. */
export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR.test(value);

/** `#rrggbb` plus an alpha, as an `rgba()` string. */
const withAlpha = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// A translucent wash of the chosen colour, so one set of values reads correctly
// over both the light and the dark card background.
const hexStyle = (hex: string): ColorStyle => ({
  card: "",
  swatch: "",
  icon: "",
  cardStyle: { backgroundColor: withAlpha(hex, 0.14), borderColor: hex },
  swatchStyle: { backgroundColor: hex },
  iconStyle: { color: hex },
});

/** True when a stored value maps to real styling rather than the default. */
export const hasCollectionColor = (color: string | null | undefined): boolean =>
  isCollectionColor(color) || isHexColor(color);

/** Styling for a stored colour, falling back to the default for null/unknown. */
export const getCollectionColorStyle = (
  color: string | null | undefined,
): ColorStyle => {
  if (isCollectionColor(color)) return STYLES[color];
  if (isHexColor(color)) return hexStyle(color);
  return DEFAULT_STYLE;
};

export const getSwatchClass = (color: CollectionColor): string =>
  STYLES[color].swatch;
