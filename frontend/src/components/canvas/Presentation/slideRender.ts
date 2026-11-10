import { exportToCanvas } from "@excalidraw/excalidraw";

import type { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { getSlideExportElements, slideExportAppState } from "./slideContent";

/**
 * A slide as a picture, `scale` pixels per scene unit: what the PDF pages and
 * the panel's thumbnails are made from.
 *
 * Exporting a frame renders the scene-aligned box around it, which for a
 * rotated frame is larger than the frame and turned. That picture is turned
 * back here and cut to the frame, so a slide comes out level, the way the
 * presentation shows it.
 */
export const renderSlide = async (
  api: ExcalidrawImperativeAPI,
  slide: ExcalidrawFrameLikeElement,
  scale: number,
): Promise<HTMLCanvasElement> => {
  const rendered = await exportToCanvas({
    elements: getSlideExportElements(api.getSceneElements(), slide.id),
    appState: slideExportAppState(api.getAppState()),
    files: api.getFiles() as BinaryFiles,
    exportingFrame: slide,
    getDimensions: (width: number, height: number) => ({
      width: width * scale,
      height: height * scale,
      scale,
    }),
  });
  if (!slide.angle) {
    return rendered;
  }

  const level = document.createElement("canvas");
  level.width = Math.max(1, Math.round(slide.width * scale));
  level.height = Math.max(1, Math.round(slide.height * scale));
  const context = level.getContext("2d");
  if (!context) {
    return rendered;
  }
  // both pictures share their centre: the frame's
  context.translate(level.width / 2, level.height / 2);
  context.rotate(-slide.angle);
  context.drawImage(rendered, -rendered.width / 2, -rendered.height / 2);
  return level;
};
