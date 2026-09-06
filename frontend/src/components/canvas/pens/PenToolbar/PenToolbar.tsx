import React, { useCallback, useState } from "react";

import { t } from "@excalidraw/excalidraw";
import { useUIAppState } from "@excalidraw/excalidraw";

import type {
  ExcalidrawImperativeAPI,
  PenStyle,
  AppState,
} from "@excalidraw/excalidraw/types";

import { PENS } from "../pens";
import { PenSettingsModal, getPenTypeLabel } from "../PenSettingsModal";

import styles from "./PenToolbar.module.scss";

// Simple pen icons using SVG paths
const PenIcon = ({ type }: { type: string; isActive: boolean }) => {
  const getIconColor = () => {
    switch (type) {
      case "highlighter":
        return "#FFC47C";
      case "finetip":
        return "#3E6F8D";
      case "fountain":
        return "#000000";
      case "marker":
        return "#B83E3E";
      case "thick-thin":
      case "thin-thick-thin":
        return "#CECDCC";
      default:
        return "currentColor";
    }
  };

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={getIconColor()}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "highlighter" ? (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          <rect
            x="3"
            y="17"
            width="14"
            height="4"
            fill={getIconColor()}
            opacity="0.5"
          />
        </>
      ) : type === "finetip" ? (
        <path d="M12 19l7-7 3 3-7 7-3-3z M18 12l-1.5-1.5M2 21l3-3m0 0l7-7m3 3l-7 7" />
      ) : type === "fountain" ? (
        <>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          <path d="M15 5l3 3" />
        </>
      ) : type === "marker" ? (
        <>
          <path d="M12 20h9" />
          <path
            d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
            strokeWidth="3"
          />
        </>
      ) : type === "thick-thin" ? (
        <path d="M4 20Q8 10 12 10T20 4" strokeWidth="3" />
      ) : type === "thin-thick-thin" ? (
        <path d="M4 20Q8 12 12 12T20 4" strokeWidth="2" />
      ) : (
        // Default pen icon
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      )}
    </svg>
  );
};

export interface PenToolbarProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
}

// Get pens from appState or fall back to defaults
const getPens = (appState: AppState): PenStyle[] => {
  if (appState.customPens && appState.customPens.length > 0) {
    return appState.customPens;
  }
  return Object.values(PENS);
};

/**
 * PenToolbar - Custom pen presets toolbar
 *
 * IMPORTANT: All React hooks must be called before any conditional returns.
 * The zen/view mode check is placed AFTER all hooks to comply with
 * React's Rules of Hooks (hooks must be called in the same order every render).
 */
export const PenToolbar: React.FC<PenToolbarProps> = ({ excalidrawAPI }) => {
  // Use reactive UI state for sidebar and zen mode detection
  const uiAppState = useUIAppState();
  const isSidebarOpen = !!uiAppState.openSidebar;
  const isZenMode = uiAppState.zenModeEnabled;
  const isViewMode = uiAppState.viewModeEnabled;

  const appState = excalidrawAPI.getAppState();
  const currentPenType = appState.currentPenType;
  const pens = getPens(appState);

  // State for pen settings modal - must be before any conditional returns
  const [editingPenIndex, setEditingPenIndex] = useState<number | null>(null);

  const setPen = useCallback(
    (pen: PenStyle) => {
      const st = excalidrawAPI.getAppState();

      // Save current state if switching to a freedrawOnly pen
      const resetCustomPen =
        pen.freedrawOnly && !st.resetCustomPen
          ? {
              currentItemStrokeWidth: st.currentItemStrokeWidth,
              currentItemBackgroundColor: st.currentItemBackgroundColor,
              currentItemStrokeColor: st.currentItemStrokeColor,
              currentItemFillStyle: st.currentItemFillStyle as string,
              currentItemRoughness: st.currentItemRoughness,
            }
          : null;

      // Build the appState update object
      const appStateUpdate: Record<string, unknown> = {
        currentStrokeOptions: pen.penOptions,
        currentPenType: pen.type,
      };

      // Apply pen properties following Obsidian Excalidraw plugin patterns:
      // - strokeWidth: 0 means "keep current canvas width" (don't override)
      // - backgroundColor/strokeColor: only apply if defined
      // - fillStyle: "" means "keep current" (don't override)
      // - roughness: null means "keep current" (don't override)
      if (pen.strokeWidth && pen.strokeWidth > 0) {
        appStateUpdate.currentItemStrokeWidth = pen.strokeWidth;
      }
      if (pen.backgroundColor) {
        appStateUpdate.currentItemBackgroundColor = pen.backgroundColor;
      }
      if (pen.strokeColor) {
        appStateUpdate.currentItemStrokeColor = pen.strokeColor;
      }
      if (pen.fillStyle) {
        appStateUpdate.currentItemFillStyle = pen.fillStyle;
      }
      if (pen.roughness !== null && pen.roughness !== undefined) {
        appStateUpdate.currentItemRoughness = pen.roughness;
      }
      if (resetCustomPen) {
        appStateUpdate.resetCustomPen = resetCustomPen;
      }

      excalidrawAPI.updateScene({
        appState: appStateUpdate as Pick<AppState, keyof AppState>,
      });

      // Set freedraw tool
      excalidrawAPI.setActiveTool({ type: "freedraw" });
    },
    [excalidrawAPI],
  );

  const resetToDefault = useCallback(() => {
    const st = excalidrawAPI.getAppState();

    const appStateUpdate: Record<string, unknown> = {
      resetCustomPen: null,
      currentStrokeOptions: null,
      currentPenType: null,
    };

    if (st.resetCustomPen) {
      appStateUpdate.currentItemStrokeWidth =
        st.resetCustomPen.currentItemStrokeWidth;
      appStateUpdate.currentItemBackgroundColor =
        st.resetCustomPen.currentItemBackgroundColor;
      appStateUpdate.currentItemStrokeColor =
        st.resetCustomPen.currentItemStrokeColor;
      appStateUpdate.currentItemFillStyle =
        st.resetCustomPen.currentItemFillStyle;
      appStateUpdate.currentItemRoughness =
        st.resetCustomPen.currentItemRoughness;
    }

    excalidrawAPI.updateScene({
      appState: appStateUpdate as Pick<AppState, keyof AppState>,
    });
  }, [excalidrawAPI]);

  const savePen = useCallback(
    (updatedPen: PenStyle, index: number) => {
      const st = excalidrawAPI.getAppState();
      const currentPens = getPens(st);
      const newPens = [...currentPens];
      newPens[index] = updatedPen;

      excalidrawAPI.updateScene({
        appState: {
          customPens: newPens,
        } as Pick<AppState, keyof AppState>,
      });

      // If this pen is currently active, update current stroke options too
      if (st.currentPenType === updatedPen.type) {
        setPen(updatedPen);
      }
    },
    [excalidrawAPI, setPen],
  );

  const isPenActive = (pen: PenStyle): boolean => {
    return currentPenType === pen.type;
  };

  // Hide toolbar in zen mode or view mode (presentation mode uses both)
  // This must be after all hooks are defined
  if (isZenMode || isViewMode) {
    return null;
  }

  return (
    <>
      <div
        // The stable class is notecanvas's: the CSS-module hash is not something
        // app styles can target, and the sidebar offset is fixed up there.
        className={`notecanvas-pen-toolbar ${styles.toolbar} ${
          isSidebarOpen ? `notecanvas-pen-toolbar--sidebar-open ${styles.sidebarOpen}` : ""
        }`}
      >
        <div className={styles.pens}>
          {pens.map((pen, index) => {
            const isActive = isPenActive(pen);

            return (
              <button
                key={pen.type}
                className={`${styles.button} ${
                  isActive ? styles.buttonActive : ""
                }`}
                onClick={() => {
                  if (isActive) {
                    resetToDefault();
                  } else {
                    setPen(pen);
                  }
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingPenIndex(index);
                }}
                title={`${getPenTypeLabel(pen.type)} (${t(
                  "pens.doubleClickToConfigure",
                )})`}
                type="button"
              >
                <PenIcon type={pen.type} isActive={isActive} />
              </button>
            );
          })}
        </div>
      </div>

      {editingPenIndex !== null && pens[editingPenIndex] && (
        <PenSettingsModal
          excalidrawAPI={excalidrawAPI}
          pen={pens[editingPenIndex]}
          penIndex={editingPenIndex}
          onClose={() => setEditingPenIndex(null)}
          onSave={(updatedPen) => savePen(updatedPen, editingPenIndex)}
        />
      )}
    </>
  );
};

export default PenToolbar;
