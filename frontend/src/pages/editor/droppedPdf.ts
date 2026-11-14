import { createDroppedFileId, type DroppedImageData } from "./droppedImages";

/** Space between two pages in the stacked SVG, in PDF points. */
const PAGE_GAP = 16;
/** Sharpest render, as a multiple of the page's own size in points. */
const MAX_RENDER_SCALE = 2;
/** Pixel budget across all pages, so long documents still fit one image. */
const MAX_TOTAL_PIXELS = 30_000_000;
/** Stay under the backend's 10 MB cap on a single image dataURL. */
const MAX_DATA_URL_LENGTH = 9_500_000;

export const isDroppedPdfFile = (file: File): boolean =>
  file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");

const loadPdfJs = async () => {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
};

type RenderedPage = { href: string; width: number; height: number };

/**
 * Turn a PDF into a single SVG image with every page stacked top to bottom,
 * first page on top. Each page is rendered to a JPEG inside the SVG, so text
 * becomes pixels; the render scale drops until the whole image fits the
 * size the server accepts.
 */
export const loadDroppedPdfData = async (
  file: File,
): Promise<DroppedImageData> => {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pdf = await loadingTask.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      pages.push(await pdf.getPage(number));
    }
    const sizes = pages.map((page) => page.getViewport({ scale: 1 }));
    const width = Math.max(...sizes.map((size) => size.width));
    const height =
      sizes.reduce((sum, size) => sum + size.height, 0) +
      PAGE_GAP * (pages.length - 1);
    const area = sizes.reduce((sum, size) => sum + size.width * size.height, 0);

    let scale = Math.min(MAX_RENDER_SCALE, Math.sqrt(MAX_TOTAL_PIXELS / area));
    for (;;) {
      const rendered: RenderedPage[] = [];
      for (const page of pages) {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        await page.render({ canvas, viewport, background: "#ffffff" }).promise;
        rendered.push({
          href: canvas.toDataURL("image/jpeg", 0.88),
          width: viewport.width / scale,
          height: viewport.height / scale,
        });
        canvas.width = canvas.height = 0;
      }

      let y = 0;
      const images = rendered.map((page) => {
        const x = (width - page.width) / 2;
        const tag = `<image href="${page.href}" x="${x}" y="${y}" width="${page.width}" height="${page.height}"/>`;
        y += page.height + PAGE_GAP;
        return tag;
      });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${images.join("")}</svg>`;
      // plain ASCII (base64 images in ASCII markup), so btoa is safe
      const dataURL = `data:image/svg+xml;base64,${btoa(svg)}`;

      if (dataURL.length <= MAX_DATA_URL_LENGTH || scale < 0.3) {
        return {
          fileId: createDroppedFileId(),
          mimeType: "image/svg+xml",
          dataURL,
          created: Date.now(),
          width: Math.round(width),
          height: Math.round(height),
        };
      }
      scale *= Math.sqrt(MAX_DATA_URL_LENGTH / dataURL.length) * 0.9;
    }
  } finally {
    void loadingTask.destroy();
  }
};
