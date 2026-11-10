import { isFrameLikeElement } from "@excalidraw/element";
import { updateActiveTool } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import type { Theme } from "@excalidraw/element/types";

import { register } from "./register";

import type { AppState, PresentationModeState } from "../types";

/**
 * The slides of a presentation, in order. Mirrors what the host app's slides
 * panel does (it keeps both on each frame's `customData`): frames marked
 * hidden are skipped, frames with a stored position come first in that order,
 * and the rest follow alphabetically by name.
 */
const getFramesSortedForPresentation = (
  elements: readonly {
    type: string;
    isDeleted?: boolean;
    name?: string | null;
    id: string;
    customData?: Record<string, any>;
  }[],
): string[] => {
  const frames: { id: string; name: string; order: number }[] = [];

  for (const el of elements) {
    if (
      isFrameLikeElement(el as ExcalidrawFrameLikeElement) &&
      !el.isDeleted &&
      el.customData?.slideHidden !== true
    ) {
      const order = el.customData?.slideOrder;
      frames.push({
        id: el.id,
        name: (el as ExcalidrawFrameLikeElement).name || `Frame ${el.id}`,
        order: typeof order === "number" ? order : Infinity,
      });
    }
  }

  frames.sort((a, b) =>
    a.order !== b.order
      ? a.order - b.order
      : a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  return frames.map((f) => f.id);
};

/**
 * Start presentation mode.
 * Requires frames to be present in the scene.
 */
export const actionStartPresentation = register({
  name: "startPresentation",
  label: "labels.startPresentation",
  keywords: ["presentation", "slideshow", "present", "frames"],
  trackEvent: { category: "canvas" },
  viewMode: true,
  perform: (elements, appState) => {
    // Check if already in presentation mode
    if (appState.presentationMode?.active) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const slideIds = getFramesSortedForPresentation(elements);

    if (slideIds.length === 0) {
      return {
        elements,
        appState: {
          ...appState,
          toast: {
            message: "No frames found. Add frames to create slides.",
            duration: 3000,
            closable: true,
          },
        },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    // notecanvas: the host app moves the camera whenever the current slide
    // changes, so each slide's own transition plays however the step was made

    const presentationState: PresentationModeState = {
      active: true,
      currentSlide: 0,
      slides: slideIds,
      originalTheme: appState.theme,
      originalFrameRendering: { ...appState.frameRendering },
    };

    return {
      elements,
      appState: {
        ...appState,
        presentationMode: presentationState,
        viewModeEnabled: true,
        zenModeEnabled: true,
        // Hide frame borders and names during presentation
        frameRendering: {
          ...appState.frameRendering,
          outline: false,
          name: false,
        },
        // Use selection tool - laser is now implicit (any pointer draws laser trail)
        activeTool: updateActiveTool(appState, {
          type: "selection",
        }),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (elements) => {
    // Only available if there are frames
    return elements.some((el) => isFrameLikeElement(el) && !el.isDeleted);
  },
  keyTest: (event) =>
    event.altKey && event.shiftKey && event.key.toLowerCase() === "p",
});

/**
 * Go to the next slide in presentation mode.
 */
export const actionNextSlide = register({
  name: "nextSlide",
  label: "labels.nextSlide",
  keywords: ["next", "forward", "slide"],
  trackEvent: { category: "canvas" },
  viewMode: true,
  perform: (elements, appState) => {
    const presentationMode = appState.presentationMode;
    if (!presentationMode?.active) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const { currentSlide, slides } = presentationMode;

    // Already at last slide
    if (currentSlide >= slides.length - 1) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const nextSlideIndex = currentSlide + 1;
    return {
      elements,
      appState: {
        ...appState,
        presentationMode: {
          ...presentationMode,
          currentSlide: nextSlideIndex,
        },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (_, appState) => !!appState.presentationMode?.active,
  keyTest: (event, appState) => {
    if (!appState.presentationMode?.active) {
      return false;
    }
    return (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (event.key === "ArrowRight" ||
        event.key === "ArrowDown" ||
        event.key === " ")
    );
  },
});

/**
 * Go to the previous slide in presentation mode.
 */
export const actionPrevSlide = register({
  name: "prevSlide",
  label: "labels.prevSlide",
  keywords: ["previous", "back", "slide"],
  trackEvent: { category: "canvas" },
  viewMode: true,
  perform: (elements, appState) => {
    const presentationMode = appState.presentationMode;
    if (!presentationMode?.active) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const { currentSlide, slides } = presentationMode;

    // Already at first slide
    if (currentSlide <= 0) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const prevSlideIndex = currentSlide - 1;
    return {
      elements,
      appState: {
        ...appState,
        presentationMode: {
          ...presentationMode,
          currentSlide: prevSlideIndex,
        },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (_, appState) => !!appState.presentationMode?.active,
  keyTest: (event, appState) => {
    if (!appState.presentationMode?.active) {
      return false;
    }
    return (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowUp")
    );
  },
});

/**
 * Exit presentation mode and restore original settings.
 */
export const actionExitPresentation = register({
  name: "exitPresentation",
  label: "labels.exitPresentation",
  keywords: ["exit", "end", "stop", "presentation"],
  trackEvent: { category: "canvas" },
  viewMode: true,
  perform: (elements, appState) => {
    const presentationMode = appState.presentationMode;
    if (!presentationMode?.active) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    // Build restored state
    const restoredAppState: Partial<AppState> = {
      presentationMode: null,
      viewModeEnabled: false,
      zenModeEnabled: false,
      activeTool: {
        ...appState.activeTool,
        type: "selection",
        customType: null,
        lastActiveTool: null,
      },
    };

    // Restore original theme if saved
    if (presentationMode.originalTheme) {
      restoredAppState.theme = presentationMode.originalTheme;
    }

    // Restore original frame rendering if saved
    if (presentationMode.originalFrameRendering) {
      restoredAppState.frameRendering = presentationMode.originalFrameRendering;
    }

    return {
      elements,
      appState: {
        ...appState,
        ...restoredAppState,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (_, appState) => !!appState.presentationMode?.active,
  keyTest: (event, appState) => {
    if (!appState.presentationMode?.active) {
      return false;
    }
    return event.key === "Escape";
  },
});

/**
 * Toggle theme during presentation (light/dark).
 */
export const actionTogglePresentationTheme = register({
  name: "togglePresentationTheme",
  label: "labels.toggleTheme",
  keywords: ["theme", "dark", "light", "presentation"],
  trackEvent: { category: "canvas" },
  viewMode: true,
  perform: (elements, appState) => {
    const presentationMode = appState.presentationMode;
    if (!presentationMode?.active) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const newTheme: Theme = appState.theme === "dark" ? "light" : "dark";

    return {
      elements,
      appState: {
        ...appState,
        theme: newTheme,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (_, appState) => !!appState.presentationMode?.active,
  keyTest: (event, appState) => {
    if (!appState.presentationMode?.active) {
      return false;
    }
    return (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.toLowerCase() === "t"
    );
  },
});

/**
 * Go to a specific slide by index.
 * This action is meant to be called programmatically, not via keyboard.
 * Pass the slide index as formData when executing the action.
 */
export const actionGoToSlide = register({
  name: "goToSlide",
  label: "labels.goToSlide",
  keywords: ["go", "slide", "jump"],
  trackEvent: { category: "canvas" },
  viewMode: true,
  perform: (elements, appState, formData) => {
    const presentationMode = appState.presentationMode;
    const slideIndex = typeof formData === "number" ? formData : undefined;

    if (!presentationMode?.active || slideIndex === undefined) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const { slides } = presentationMode;
    const targetIndex = Math.max(0, Math.min(slideIndex, slides.length - 1));
    return {
      elements,
      appState: {
        ...appState,
        presentationMode: {
          ...presentationMode,
          currentSlide: targetIndex,
        },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (_, appState) => !!appState.presentationMode?.active,
});
