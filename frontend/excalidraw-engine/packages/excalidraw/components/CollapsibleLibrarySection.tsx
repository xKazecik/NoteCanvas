import React, { memo, useState } from "react";

import clsx from "clsx";

import { resolveLocalizedName } from "../data/libraryUtils";
import { useI18n } from "../i18n";

import { collapseDownIcon, collapseUpIcon } from "./icons";
import {
  LibraryMenuSection,
  LibraryMenuSectionGrid,
} from "./LibraryMenuSection";

import type { SvgCache } from "../hooks/useLibraryItemSvg";
import type { LibraryItem, LibraryLocalizedNames } from "../types";

interface CollapsibleLibrarySectionProps {
  /** Fallback library name (used as key and fallback display) */
  libraryName: string;
  /** Localized names map for i18n support */
  libraryNames?: LibraryLocalizedNames;
  items: LibraryItem[];
  onItemSelectToggle: (id: LibraryItem["id"], event: React.MouseEvent) => void;
  onItemDrag: (id: LibraryItem["id"], event: React.DragEvent) => void;
  onItemClick: (id: LibraryItem["id"] | null) => void;
  isItemSelected: (id: LibraryItem["id"] | null) => boolean;
  svgCache: SvgCache;
  itemsRenderedPerBatch: number;
  defaultCollapsed?: boolean;
}

export const CollapsibleLibrarySection = memo(
  ({
    libraryName,
    libraryNames,
    items,
    onItemSelectToggle,
    onItemDrag,
    onItemClick,
    isItemSelected,
    svgCache,
    itemsRenderedPerBatch,
    defaultCollapsed = false,
  }: CollapsibleLibrarySectionProps) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    // Subscribe to language changes to re-render when language changes
    useI18n();

    const toggleCollapsed = () => {
      setIsCollapsed((prev) => !prev);
    };

    // Resolve the display name based on current language
    const displayName = resolveLocalizedName(libraryNames, libraryName);

    return (
      <div className="library-menu-items-container__section">
        <button
          className={clsx("library-menu-items-container__section-header", {
            "library-menu-items-container__section-header--collapsed":
              isCollapsed,
          })}
          onClick={toggleCollapsed}
          type="button"
        >
          <span className="library-menu-items-container__section-header-icon">
            {isCollapsed ? collapseDownIcon : collapseUpIcon}
          </span>
          <span className="library-menu-items-container__section-header-title">
            {displayName}
          </span>
          <span className="library-menu-items-container__section-header-count">
            ({items.length})
          </span>
        </button>
        {!isCollapsed && (
          <LibraryMenuSectionGrid>
            <LibraryMenuSection
              itemsRenderedPerBatch={itemsRenderedPerBatch}
              items={items}
              onItemSelectToggle={onItemSelectToggle}
              onItemDrag={onItemDrag}
              onClick={onItemClick}
              isItemSelected={isItemSelected}
              svgCache={svgCache}
            />
          </LibraryMenuSectionGrid>
        )}
      </div>
    );
  },
);
