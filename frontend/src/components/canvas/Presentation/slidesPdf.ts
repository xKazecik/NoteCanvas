import { exportToCanvas } from "@excalidraw/excalidraw";

import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { buildPdf } from "./pdfWriter";
import { getSlideLinks } from "./slideLinks";
import { getOrderedSlides, isSlideHidden } from "./slideTransitions";

import type { PdfPage } from "./pdfWriter";

/** Pixels rendered per scene unit: enough to stay sharp when zoomed in on. */
const RENDER_SCALE = 2;
/** Above this many pixels on a side, a slide is rendered at a lower scale. */
const MAX_RENDER_SIDE = 4000;
/** Every page is this wide in points; its height follows the slide's shape. */
const PAGE_WIDTH = 960;

const canvasToJpeg = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)))
          : reject(new Error("Could not render the slide.")),
      "image/jpeg",
      0.92,
    ),
  );

/**
 * The presentation as a PDF, one slide per page in presentation order, without
 * the slides set to be skipped. Returns null when there are no slides.
 */
export const exportSlidesToPdf = async (
  api: ExcalidrawImperativeAPI,
): Promise<Uint8Array | null> => {
  const elements = api.getSceneElements();
  const slides = getOrderedSlides(elements).filter(
    (slide) => !isSlideHidden(slide),
  );
  if (!slides.length) {
    return null;
  }

  const appState = api.getAppState();
  const pages: PdfPage[] = [];
  for (const slide of slides) {
    const scale = Math.min(
      RENDER_SCALE,
      MAX_RENDER_SIDE / Math.max(slide.width, slide.height),
    );
    const canvas = await exportToCanvas({
      elements,
      appState: {
        ...appState,
        exportBackground: true,
        // a document is read on white, whatever theme the editor is in
        exportWithDarkMode: false,
      },
      files: api.getFiles() as BinaryFiles,
      exportingFrame: slide,
      getDimensions: (width: number, height: number) => ({
        width: width * scale,
        height: height * scale,
        scale,
      }),
    });

    const pageScale = PAGE_WIDTH / slide.width;
    pages.push({
      width: PAGE_WIDTH,
      height: slide.height * pageScale,
      jpeg: await canvasToJpeg(canvas),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      links: getSlideLinks(slide, elements, pageScale),
    });
  }

  return buildPdf(pages, { title: api.getName() });
};

/** Export the slides and hand the file to the browser to save. */
export const downloadSlidesPdf = async (api: ExcalidrawImperativeAPI) => {
  const pdf = await exportSlidesToPdf(api);
  if (!pdf) {
    return false;
  }
  const url = URL.createObjectURL(
    new Blob([pdf as BlobPart], { type: "application/pdf" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(api.getName() || "slides").replace(/[\\/:*?"<>|]+/g, " ").trim() || "slides"}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // the download has been handed over by the time this runs
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
};
