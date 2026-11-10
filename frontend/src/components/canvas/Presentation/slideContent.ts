import type { ExcalidrawElement } from "@excalidraw/element/types";

/**
 * The elements to hand the exporter for one slide.
 *
 * Exporting a frame normally keeps only the frame's own children and loose
 * elements, so anything that belongs to another frame is dropped even where
 * it shows inside this one: a frame nested in the slide, its contents, or an
 * element that sits across two slides. A slide is a picture of what is on
 * screen inside it, so those are released from their frames here. Frame
 * exports are not clipped, and the export is cropped to the slide either way,
 * so this changes nothing but what gets drawn.
 */
export const getSlideExportElements = <T extends ExcalidrawElement>(
  elements: readonly T[],
  slideId: string,
): T[] =>
  elements.map((element) =>
    element.frameId && element.frameId !== slideId
      ? { ...element, frameId: null }
      : element,
  );

/**
 * Export settings that make a slide look the way it does on the canvas:
 * its background colour, and the dark theme when the editor is in it.
 */
export const slideExportAppState = <T extends { theme: string }>(
  appState: T,
) => ({
  ...appState,
  exportBackground: true,
  exportWithDarkMode: appState.theme === "dark",
});
