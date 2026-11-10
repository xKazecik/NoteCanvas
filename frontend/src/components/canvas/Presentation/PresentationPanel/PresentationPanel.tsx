import clsx from "clsx";
import { useCallback, useEffect, useState, useRef } from "react";

import { CaptureUpdateAction, PlusIcon } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw";
import { exportToCanvas } from "@excalidraw/excalidraw";

import type { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

import { usePresentationMode } from "../usePresentationMode";
import {
  SLIDE_SPEEDS,
  SLIDE_TRANSITIONS,
  addSlideFromView,
  getSlideSpeed,
  getSlideTransition,
  isSlideHidden,
  setSlideData,
  setSlideOrder,
} from "../slideTransitions";
import { getSlideExportElements, slideExportAppState } from "../slideContent";
import { downloadSlidesPdf } from "../slidesPdf";
import { SlidesLayoutDialog, applyLayoutToFrames } from "../SlidesLayoutDialog";

import styles from "./PresentationPanel.module.scss";

import type { LayoutType } from "../SlidesLayoutDialog";
import type { SlideSpeed, SlideTransition } from "../slideTransitions";

interface PresentationPanelProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

interface SlideThumbProps {
  frame: ExcalidrawFrameLikeElement;
  index: number;
  /** Position among the slides that will be presented; null when skipped. */
  number: number | null;
  /** Whether a transition leads into this slide, i.e. it is not the first. */
  hasTransition: boolean;
  isActive: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  onTransitionChange: (transition: SlideTransition) => void;
  onSpeedChange: (speed: SlideSpeed) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  refreshKey?: number;
}

const SlideThumb: React.FC<SlideThumbProps> = ({
  frame,
  index,
  number,
  hasTransition,
  isActive,
  isDragging,
  isDragOver,
  onClick,
  onRename,
  onDelete,
  onToggleHidden,
  onTransitionChange,
  onSpeedChange,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  excalidrawAPI,
  refreshKey,
}) => {
  const frameName = frame.name || `Frame ${index + 1}`;
  const isHidden = number === null;
  const transition = getSlideTransition(frame);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewError, setPreviewError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(frameName);

  // Update editValue when frame name changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(frame.name || `Frame ${index + 1}`);
    }
  }, [frame.name, index, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
    setEditValue(frame.name || "");
  };

  const handleFinishEditing = () => {
    setIsEditing(false);
    const trimmedValue = editValue.trim();
    if (trimmedValue !== frame.name) {
      onRename(trimmedValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFinishEditing();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(frame.name || `Frame ${index + 1}`);
    }
  };

  // Generate preview when frame changes
  useEffect(() => {
    if (!excalidrawAPI || !canvasRef.current) {
      return;
    }

    const generatePreview = async () => {
      try {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();

        const exportedCanvas = await exportToCanvas({
          // the same picture the PDF gets, so the thumbnail is a true preview
          elements: getSlideExportElements(elements, frame.id),
          appState: slideExportAppState(appState),
          files: files as BinaryFiles,
          exportingFrame: frame,
          maxWidthOrHeight: 300,
        });

        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && canvasRef.current) {
          const previewWidth = canvasRef.current.width;
          const previewHeight = canvasRef.current.height;
          ctx.clearRect(0, 0, previewWidth, previewHeight);

          // fit while keeping the aspect ratio, centred
          const scale = Math.min(
            previewWidth / exportedCanvas.width,
            previewHeight / exportedCanvas.height,
          );
          const scaledWidth = exportedCanvas.width * scale;
          const scaledHeight = exportedCanvas.height * scale;
          ctx.drawImage(
            exportedCanvas,
            (previewWidth - scaledWidth) / 2,
            (previewHeight - scaledHeight) / 2,
            scaledWidth,
            scaledHeight,
          );
          setPreviewError(false);
        }
      } catch (error) {
        console.error("Failed to generate frame preview:", error);
        setPreviewError(true);
      }
    };

    // Debounce preview generation
    const timeoutId = setTimeout(generatePreview, 100);
    return () => clearTimeout(timeoutId);
  }, [frame, excalidrawAPI, refreshKey]);

  const skipLabel = isHidden
    ? t("presentation.unskipSlide")
    : t("presentation.skipSlide");

  return (
    <div
      className={clsx(styles.slide, {
        [styles.slideActive]: isActive,
        [styles.slideDragging]: isDragging,
        [styles.slideDragOver]: isDragOver,
        [styles.slideHidden]: isHidden,
      })}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragOver && <div className={styles.dropIndicator} />}

      <div
        className={styles.slideContent}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        title={`${t("presentation.goToSlide")} ${frameName}`}
      >
        <div className={styles.slidePreview}>
          <canvas
            ref={canvasRef}
            width={280}
            height={158}
            className={styles.slideCanvas}
          />
          {previewError && (
            <span className={styles.slideNumber}>{index + 1}</span>
          )}
          <span className={styles.slideBadge}>
            {isHidden ? t("presentation.skipped") : number}
          </span>
          {/* Hover overlay with actions */}
          <div className={styles.slideOverlay}>
            <button
              className={styles.overlayAction}
              onClick={handleStartEditing}
              title={t("presentation.renameFrame")}
              aria-label={t("presentation.renameFrame")}
            >
              <Icon>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </Icon>
            </button>
            <button
              className={styles.overlayAction}
              onClick={(e) => {
                e.stopPropagation();
                onToggleHidden();
              }}
              title={skipLabel}
              aria-label={skipLabel}
              aria-pressed={isHidden}
            >
              <Icon>
                {isHidden ? (
                  <>
                    <path d="M3 3l18 18" />
                    <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.2 3.9M6.6 6.6C3.7 8.5 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 4.4-1.1" />
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </>
                ) : (
                  <>
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </Icon>
            </button>
            <button
              className={clsx(styles.overlayAction, styles.overlayActionDanger)}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title={t("presentation.deleteSlide")}
              aria-label={t("presentation.deleteSlide")}
            >
              <Icon>
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </Icon>
            </button>
            <div
              className={styles.overlayDragHandle}
              title={t("presentation.dragToReorder")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className={styles.slideNameInput}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleFinishEditing}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          placeholder={`Frame ${index + 1}`}
        />
      ) : (
        <span
          className={styles.slideName}
          onDoubleClick={handleStartEditing}
          title={t("presentation.doubleClickToRename")}
        >
          {frameName}
        </span>
      )}

      {/* How the presentation arrives on this slide. The first slide has
          nothing to arrive from, and a skipped one is never arrived on. */}
      {hasTransition && !isHidden && (
        <div className={styles.slideTransition}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <select
            className={styles.slideSelect}
            value={transition}
            title={t("presentation.transitionInto")}
            aria-label={t("presentation.transitionInto")}
            onChange={(event) =>
              onTransitionChange(event.target.value as SlideTransition)
            }
          >
            {SLIDE_TRANSITIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.label)}
              </option>
            ))}
          </select>
          {transition !== "cut" && (
            <select
              className={clsx(styles.slideSelect, styles.slideSelectSpeed)}
              value={getSlideSpeed(frame)}
              title={t("presentation.transitionSpeed")}
              aria-label={t("presentation.transitionSpeed")}
              onChange={(event) =>
                onSpeedChange(event.target.value as SlideSpeed)
              }
            >
              {SLIDE_SPEEDS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
};

const PresentationInstructions: React.FC<{
  onCreateSlide: () => void;
  onAddView: () => void;
}> = ({ onCreateSlide, onAddView }) => {
  return (
    <div className={styles.instructions}>
      <div className={styles.instructionsIcon}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4l18 0" />
          <path d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10" />
          <path d="M12 16l0 4" />
          <path d="M9 20l6 0" />
          <path d="M8 12l3 -3l2 2l3 -3" />
        </svg>
      </div>
      <h3 className={styles.instructionsTitle}>
        {t("presentation.noFramesTitle")}
      </h3>
      <p className={styles.instructionsText}>
        {t("presentation.noFramesDescription")}
      </p>
      <ol className={styles.instructionsSteps}>
        <li>{t("presentation.noFramesStep1")}</li>
        <li>{t("presentation.noFramesStep2")}</li>
        <li>{t("presentation.noFramesStep3")}</li>
        <li>{t("presentation.noFramesStep4")}</li>
      </ol>
      <button className={styles.createSlideButton} onClick={onCreateSlide}>
        {PlusIcon}
        <span>{t("presentation.createFirstSlide")}</span>
      </button>
      <button className={styles.addViewButton} onClick={onAddView}>
        {t("presentation.addViewAsSlide")}
      </button>
    </div>
  );
};

export const PresentationPanel: React.FC<PresentationPanelProps> = ({
  excalidrawAPI,
}) => {
  // The slides in presentation order, as stored on the frames themselves
  const [orderedFrames, setOrderedFrames] = useState<
    ExcalidrawFrameLikeElement[]
  >([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  // Key to trigger preview refresh when scene changes
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  const [isLayoutDialogOpen, setIsLayoutDialogOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const slidesContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<number | null>(null);

  const { startPresentation, getFrames, isPresentationMode } =
    usePresentationMode({ excalidrawAPI });

  const refreshFrames = useCallback(() => {
    setOrderedFrames(getFrames());
    setPreviewRefreshKey((prev) => prev + 1);
  }, [getFrames]);

  // Refresh on mount and when elements change
  useEffect(() => {
    refreshFrames();

    if (!excalidrawAPI) {
      return;
    }

    const unsubscribe = excalidrawAPI.onChange((_, appState) => {
      // while presenting the panel is not shown and the camera changes on
      // every animation frame, so there is nothing worth redrawing
      if (!appState.presentationMode?.active) {
        refreshFrames();
      }
    });

    return () => unsubscribe();
  }, [excalidrawAPI, refreshFrames]);

  const handleCreateSlide = useCallback(() => {
    if (!excalidrawAPI) {
      return;
    }

    excalidrawAPI.setActiveTool({ type: "frame" });
    excalidrawAPI.setToast({
      message: t("presentation.drawFrameToast"),
      duration: 3000,
      closable: true,
    });
  }, [excalidrawAPI]);

  // Clicking a slide selects it and brings its frame into view
  const handleSlideClick = useCallback(
    (frame: ExcalidrawFrameLikeElement) => {
      if (!excalidrawAPI) {
        return;
      }

      setSelectedFrameId(frame.id);
      excalidrawAPI.scrollToContent(frame, {
        fitToContent: true,
        animate: true,
        duration: 300,
      });
    },
    [excalidrawAPI],
  );

  /**
   * Removes the frame but keeps what was inside it, which is what Excalidraw
   * itself does when you delete a frame: the children are released onto the
   * canvas rather than deleted with it. Undoable with Ctrl+Z.
   */
  const handleDeleteFrame = useCallback(
    (frameId: string) => {
      if (!excalidrawAPI) return;

      const elements = excalidrawAPI.getSceneElements();
      const remaining = elements
        .filter((element) => element.id !== frameId)
        .map((element) =>
          element.frameId === frameId ? { ...element, frameId: null } : element,
        );

      excalidrawAPI.updateScene({
        elements: remaining,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [excalidrawAPI],
  );

  const stopAutoScroll = () => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  };

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));

      // Add a slight delay to allow the drag image to be created
      requestAnimationFrame(() => {
        const target = e.target as HTMLElement;
        target.style.opacity = "0.5";
      });
    },
    [],
  );

  const handleDragEnd = useCallback(
    () => (e: React.DragEvent) => {
      const target = e.target as HTMLElement;
      target.style.opacity = "";
      setDraggedIndex(null);
      setDragOverIndex(null);
      stopAutoScroll();
    },
    [],
  );

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      if (draggedIndex !== null && draggedIndex !== index) {
        setDragOverIndex(index);
      }

      // Auto-scroll when near edges
      const container = slidesContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const scrollZone = 60;
        stopAutoScroll();

        if (e.clientY < rect.top + scrollZone) {
          autoScrollIntervalRef.current = window.setInterval(() => {
            container.scrollBy(0, -8);
          }, 16);
        } else if (e.clientY > rect.bottom - scrollZone) {
          autoScrollIntervalRef.current = window.setInterval(() => {
            container.scrollBy(0, 8);
          }, 16);
        }
      }
    },
    [draggedIndex],
  );

  const handleDragLeave = useCallback(
    () => (e: React.DragEvent) => {
      // Only clear if we're leaving the slide entirely
      const relatedTarget = e.relatedTarget as HTMLElement;
      const currentTarget = e.currentTarget as HTMLElement;
      if (!currentTarget.contains(relatedTarget)) {
        setDragOverIndex(null);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (dropIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      stopAutoScroll();
      setDraggedIndex(null);
      setDragOverIndex(null);

      if (
        !excalidrawAPI ||
        draggedIndex === null ||
        draggedIndex === dropIndex
      ) {
        return;
      }

      const newOrder = [...orderedFrames];
      const [draggedItem] = newOrder.splice(draggedIndex, 1);
      // dropping lands above the target, which has shifted up by one if the
      // dragged slide came from before it
      newOrder.splice(
        draggedIndex < dropIndex ? dropIndex - 1 : dropIndex,
        0,
        draggedItem,
      );
      // the order is stored on the frames; the change event redraws the list
      setSlideOrder(
        excalidrawAPI,
        newOrder.map((frame) => frame.id),
      );
    },
    [excalidrawAPI, draggedIndex, orderedFrames],
  );

  const handleRenameFrame = useCallback(
    (frameId: string, newName: string) => {
      if (!excalidrawAPI) {
        return;
      }

      const elements = excalidrawAPI.getSceneElements();
      const updatedElements = elements.map((el) => {
        if (
          el.id === frameId &&
          (el.type === "frame" || el.type === "magicframe")
        ) {
          return {
            ...el,
            name: newName || null,
          };
        }
        return el;
      });

      excalidrawAPI.updateScene({
        elements: updatedElements,
      });
    },
    [excalidrawAPI],
  );

  const handleApplyLayout = useCallback(
    (layout: LayoutType, columnCount: number) => {
      if (!excalidrawAPI || orderedFrames.length === 0) {
        return;
      }
      applyLayoutToFrames(excalidrawAPI, orderedFrames, layout, columnCount);
    },
    [excalidrawAPI, orderedFrames],
  );

  const handleExportPdf = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    setIsExportingPdf(true);
    try {
      await downloadSlidesPdf(excalidrawAPI);
    } catch (error) {
      console.error("Failed to export slides as PDF:", error);
      excalidrawAPI.setToast({
        message: t("presentation.exportPdfFailed"),
        duration: 4000,
        closable: true,
      });
    } finally {
      setIsExportingPdf(false);
    }
  }, [excalidrawAPI]);

  // Cleanup auto-scroll on unmount
  useEffect(() => stopAutoScroll, []);

  // Don't render if in presentation mode
  if (isPresentationMode) {
    return null;
  }

  const hasFrames = orderedFrames.length > 0;
  // slide numbers count only the slides that will be shown
  let shownCount = 0;
  const numbers = orderedFrames.map((frame) =>
    isSlideHidden(frame) ? null : ++shownCount,
  );
  const selectedFrame = orderedFrames.find(
    (frame) => frame.id === selectedFrameId && !isSlideHidden(frame),
  );
  const selectedNumber = selectedFrame
    ? numbers[orderedFrames.indexOf(selectedFrame)]
    : null;

  return (
    <div className={styles.panel} onWheel={(e) => e.stopPropagation()}>
      {hasFrames ? (
        <>
          {/* Header */}
          <div className={styles.header}>
            <span className={styles.title}>
              {shownCount} {t("presentation.title").toLowerCase()}
            </span>
            <div className={styles.headerActions}>
              <button
                className={styles.headerButton}
                onClick={() => setIsLayoutDialogOpen(true)}
                title={t("slidesLayout.title")}
                aria-label={t("slidesLayout.title")}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                className={styles.headerButton}
                onClick={() => excalidrawAPI && addSlideFromView(excalidrawAPI)}
                title={t("presentation.addViewAsSlide")}
                aria-label={t("presentation.addViewAsSlide")}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </button>
              <button
                className={styles.headerButton}
                onClick={handleCreateSlide}
                title={t("presentation.createSlide")}
                aria-label={t("presentation.createSlide")}
              >
                {PlusIcon}
              </button>
            </div>
          </div>

          <SlidesLayoutDialog
            isOpen={isLayoutDialogOpen}
            onClose={() => setIsLayoutDialogOpen(false)}
            onApply={handleApplyLayout}
          />

          {/* Slides list */}
          <div
            className={styles.slides}
            ref={slidesContainerRef}
            onWheel={(e) => e.stopPropagation()}
          >
            {orderedFrames.map((frame, index) => (
              <SlideThumb
                key={frame.id}
                frame={frame}
                index={index}
                number={numbers[index]}
                hasTransition={(numbers[index] ?? 0) > 1}
                isActive={selectedFrameId === frame.id}
                isDragging={draggedIndex === index}
                isDragOver={dragOverIndex === index}
                onClick={() => handleSlideClick(frame)}
                onRename={(newName) => handleRenameFrame(frame.id, newName)}
                onDelete={() => handleDeleteFrame(frame.id)}
                onToggleHidden={() =>
                  excalidrawAPI &&
                  setSlideData(excalidrawAPI, frame.id, {
                    slideHidden: !isSlideHidden(frame),
                  })
                }
                onTransitionChange={(slideTransition) =>
                  excalidrawAPI &&
                  setSlideData(excalidrawAPI, frame.id, { slideTransition })
                }
                onSpeedChange={(slideSpeed) =>
                  excalidrawAPI &&
                  setSlideData(excalidrawAPI, frame.id, { slideSpeed })
                }
                onDragStart={handleDragStart(index)}
                onDragEnd={handleDragEnd()}
                onDragOver={handleDragOver(index)}
                onDragLeave={handleDragLeave()}
                onDrop={handleDrop(index)}
                excalidrawAPI={excalidrawAPI}
                refreshKey={previewRefreshKey}
              />
            ))}
          </div>

          {/* Start buttons */}
          <div className={styles.footer}>
            <button
              className={styles.startButton}
              onClick={() => startPresentation()}
              disabled={shownCount === 0}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{t("presentation.startPresentation")}</span>
            </button>
            <button
              className={styles.startFromButton}
              onClick={handleExportPdf}
              disabled={shownCount === 0 || isExportingPdf}
              title={t("presentation.exportPdfHint")}
            >
              {isExportingPdf
                ? t("presentation.exportingPdf")
                : t("presentation.exportPdf")}
            </button>
            {selectedFrame && selectedNumber !== null && selectedNumber > 1 && (
              <button
                className={styles.startFromButton}
                onClick={() => startPresentation(selectedFrame.id)}
              >
                {t("presentation.presentFromHere")} ({selectedNumber})
              </button>
            )}
          </div>
        </>
      ) : (
        <PresentationInstructions
          onCreateSlide={handleCreateSlide}
          onAddView={() => excalidrawAPI && addSlideFromView(excalidrawAPI)}
        />
      )}
    </div>
  );
};
