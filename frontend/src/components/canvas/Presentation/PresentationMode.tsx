import { createPortal } from "react-dom";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { PresentationControls } from "./PresentationControls";
import {
  usePresentationCamera,
  usePresentationMode,
} from "./usePresentationMode";

import "./presentationMode.css";

interface PresentationModeProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const PresentationMode: React.FC<PresentationModeProps> = ({
  excalidrawAPI,
}) => {
  const {
    isPresentationMode,
    currentSlide,
    totalSlides,
    nextSlide,
    prevSlide,
    toggleTheme,
    toggleFullscreen,
    endPresentation,
  } = usePresentationMode({ excalidrawAPI });

  // this component is mounted once per editor, which makes it the place to
  // drive the camera from
  usePresentationCamera(excalidrawAPI, toggleFullscreen, endPresentation);

  if (!isPresentationMode || totalSlides === 0) {
    return null;
  }

  return createPortal(
    <PresentationControls
      currentSlide={currentSlide}
      totalSlides={totalSlides}
      onPrevSlide={prevSlide}
      onNextSlide={nextSlide}
      onToggleTheme={toggleTheme}
      onToggleFullscreen={toggleFullscreen}
      onEndPresentation={endPresentation}
    />,
    document.body,
  );
};
