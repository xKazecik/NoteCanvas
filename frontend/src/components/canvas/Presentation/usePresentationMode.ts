import { useCallback, useEffect, useRef } from "react";

import { useUIAppState } from "@excalidraw/excalidraw";

import type { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { applyCamera, cameraForBox } from "./slideCamera";
import {
  cancelSlideTransition,
  getOrderedSlides,
  getSlideDuration,
  getSlideTransition,
  isSlideHidden,
  playSlideTransition,
} from "./slideTransitions";

export interface UsePresentationModeOptions {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

// How long the camera takes to settle on the slide a presentation opens with
const OPENING_DURATION = 600;

/**
 * Starting, stopping and stepping through a presentation.
 *
 * The presentation itself is `appState.presentationMode`: which slides, and
 * which one is current. This hook only ever changes that state; moving the
 * camera in response is `usePresentationCamera`'s job, so a step animates the
 * same way whether it came from a button here or a key handled by the engine.
 */
export const usePresentationMode = ({
  excalidrawAPI,
}: UsePresentationModeOptions) => {
  const appState = useUIAppState();
  const presentationMode = appState.presentationMode;

  const isPresentationMode = presentationMode?.active ?? false;
  const currentSlide = presentationMode?.currentSlide ?? 0;
  const totalSlides = presentationMode?.slides.length ?? 0;

  /** Every slide in presentation order, including the ones set to be skipped. */
  const getFrames = useCallback(
    (): ExcalidrawFrameLikeElement[] =>
      excalidrawAPI ? getOrderedSlides(excalidrawAPI.getSceneElements()) : [],
    [excalidrawAPI],
  );

  const goToSlide = useCallback(
    (slideIndex: number) => {
      if (!excalidrawAPI || !presentationMode?.active) {
        return;
      }
      const target = Math.max(
        0,
        Math.min(slideIndex, presentationMode.slides.length - 1),
      );
      if (target !== presentationMode.currentSlide) {
        excalidrawAPI.updateScene({
          appState: {
            presentationMode: { ...presentationMode, currentSlide: target },
          },
        });
      }
    },
    [excalidrawAPI, presentationMode],
  );

  const nextSlide = useCallback(
    () => goToSlide(currentSlide + 1),
    [goToSlide, currentSlide],
  );
  const prevSlide = useCallback(
    () => goToSlide(currentSlide - 1),
    [goToSlide, currentSlide],
  );

  const toggleTheme = useCallback(() => {
    if (!excalidrawAPI) {
      return;
    }
    excalidrawAPI.updateScene({
      appState: {
        theme: excalidrawAPI.getAppState().theme === "dark" ? "light" : "dark",
      },
    });
  }, [excalidrawAPI]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  /**
   * Start presenting, from the first slide or from `fromFrameId`. Slides set
   * to be skipped are left out.
   */
  const startPresentation = useCallback(
    (fromFrameId?: string) => {
      if (!excalidrawAPI) {
        return;
      }

      const frames = getFrames().filter((frame) => !isSlideHidden(frame));
      if (frames.length === 0) {
        excalidrawAPI.setToast({
          message: "No slides to present. Add frames to create slides.",
          duration: 3000,
          closable: true,
        });
        return;
      }

      // the sidebars would otherwise stay open over the slides
      excalidrawAPI.toggleSidebar({ name: "default", force: false });

      const currentAppState = excalidrawAPI.getAppState();
      excalidrawAPI.updateScene({
        appState: {
          presentationMode: {
            active: true,
            currentSlide: Math.max(
              0,
              frames.findIndex((frame) => frame.id === fromFrameId),
            ),
            slides: frames.map((frame) => frame.id),
            originalTheme: currentAppState.theme,
            originalFrameRendering: { ...currentAppState.frameRendering },
          },
          viewModeEnabled: true,
          zenModeEnabled: true,
          frameRendering: {
            ...currentAppState.frameRendering,
            outline: false,
            name: false,
          },
        },
      });
    },
    [excalidrawAPI, getFrames],
  );

  const endPresentation = useCallback(async () => {
    if (!excalidrawAPI || !presentationMode?.active) {
      return;
    }

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.error("Exit fullscreen error:", err);
      }
    }

    // updateScene accepts a partial appState, which its type does not say
    const restoredAppState = {
      presentationMode: null,
      viewModeEnabled: false,
      zenModeEnabled: false,
      ...(presentationMode.originalTheme
        ? { theme: presentationMode.originalTheme }
        : {}),
      ...(presentationMode.originalFrameRendering
        ? { frameRendering: presentationMode.originalFrameRendering }
        : {}),
    } as Parameters<typeof excalidrawAPI.updateScene>[0]["appState"];

    excalidrawAPI.updateScene({ appState: restoredAppState });
    excalidrawAPI.setActiveTool({ type: "selection" });
  }, [excalidrawAPI, presentationMode]);

  return {
    isPresentationMode,
    currentSlide,
    totalSlides,
    startPresentation,
    endPresentation,
    nextSlide,
    prevSlide,
    goToSlide,
    toggleTheme,
    toggleFullscreen,
    getFrames,
  };
};

/**
 * Keeps the camera on the current slide while presenting, playing the slide's
 * transition whenever the current slide changes. Mount it exactly once.
 *
 * Also owns the body class that hides the editor chrome, and the F key.
 */
export const usePresentationCamera = (
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  toggleFullscreen: () => void,
  endPresentation: () => void,
) => {
  const { presentationMode, width, height } = useUIAppState();
  const isActive = presentationMode?.active ?? false;
  const currentSlide = presentationMode?.currentSlide ?? 0;
  const slideIds = presentationMode?.slides;

  /** Where the camera was last sent, to tell a step from a resize. */
  const shown = useRef<{ index: number; width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    if (!excalidrawAPI || !isActive || !slideIds) {
      if (shown.current) {
        cancelSlideTransition();
        shown.current = null;
      }
      return;
    }

    const elements = excalidrawAPI.getSceneElements();
    const findFrame = (index: number) =>
      elements.find(
        (element) => element.id === slideIds[index] && element.type === "frame",
      ) as ExcalidrawFrameLikeElement | undefined;

    const to = findFrame(currentSlide);
    if (!to) {
      return;
    }
    const last = shown.current;
    shown.current = { index: currentSlide, width, height };

    if (!last) {
      playSlideTransition(excalidrawAPI, null, to, {
        transition: "smooth",
        duration: OPENING_DURATION,
      });
    } else if (last.index === currentSlide) {
      // same slide, different canvas size: entering presentation mode hides
      // the header, and the window can be resized or go fullscreen
      if (last.width !== width || last.height !== height) {
        cancelSlideTransition();
        applyCamera(excalidrawAPI, cameraForBox(to, { width, height }));
      }
    } else {
      const from = findFrame(last.index) ?? null;
      const forward = currentSlide > last.index;
      // a pair of slides animates the same way in both directions, using the
      // transition set on the later of the two
      const later = forward || !from ? to : from;
      playSlideTransition(excalidrawAPI, from, to, {
        transition: getSlideTransition(later),
        duration: getSlideDuration(later),
        direction: forward ? 1 : -1,
      });
    }
  }, [excalidrawAPI, isActive, currentSlide, slideIds, width, height]);

  useEffect(() => {
    document.body.classList.toggle("excalidraw-presentation-mode", isActive);
    return () =>
      document.body.classList.remove("excalidraw-presentation-mode");
  }, [isActive]);

  // The engine's own actions handle the arrow keys and space. Fullscreen is a
  // browser API, so F is handled here; so is Escape, which the engine gives to
  // whatever else wants it first and so never reaches its exit action.
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        endPresentation();
      } else if (
        event.key.toLowerCase() === "f" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, toggleFullscreen, endPresentation]);
};
