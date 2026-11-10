/**
 * A PDF writer for exactly what exporting slides needs: pages that are one
 * JPEG each, with clickable link rectangles over them. That is a small enough
 * corner of the format to write by hand, which spares the app a PDF library.
 */

export type PdfLink = {
  /** Rectangle in page units, measured from the page's top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
};

export type PdfPage = {
  /** Page size in points (1/72 inch). */
  width: number;
  height: number;
  /** The page's picture, as JPEG file bytes, and its size in pixels. */
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  links?: readonly PdfLink[];
};

const encoder = new TextEncoder();

/** Keep numbers short and free of exponents, which PDF does not allow. */
const num = (value: number) => String(Math.round(value * 100) / 100);

/** A PDF string literal. Non-ASCII is percent-encoded first, as a URI needs. */
const pdfString = (text: string) =>
  `(${text.replace(/[^\x20-\x7e]/g, (char) => encodeURIComponent(char)).replace(/[\\()]/g, "\\$&")})`;

/** A text string for document metadata: UTF-16BE with a byte order mark. */
const pdfTextString = (text: string) => {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
};

export const buildPdf = (
  pages: readonly PdfPage[],
  info: { title?: string } = {},
): Uint8Array => {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  /** Write object `id`, optionally with a binary stream after its dictionary. */
  const writeObject = (id: number, dictionary: string, stream?: Uint8Array) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${dictionary}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };

  // object numbers: 1 catalog, 2 page tree, 3 info, then each page's objects
  let nextId = 4;
  const allocate = () => nextId++;
  const pageIds: number[] = [];

  // the second line marks the file as binary for tools that sniff it
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  for (const page of pages) {
    const pageId = allocate();
    const contentId = allocate();
    const imageId = allocate();
    pageIds.push(pageId);

    const annotationIds = (page.links ?? []).map((link) => {
      const id = allocate();
      // PDF measures from the bottom-left corner
      const top = page.height - link.y;
      writeObject(
        id,
        `<< /Type /Annot /Subtype /Link /Rect [${num(link.x)} ${num(
          top - link.height,
        )} ${num(link.x + link.width)} ${num(top)}] /Border [0 0 0] ` +
          `/A << /S /URI /URI ${pdfString(link.url)} >> >>`,
      );
      return id;
    });

    const content = encoder.encode(
      `q ${num(page.width)} 0 0 ${num(page.height)} 0 0 cm /Im0 Do Q`,
    );
    writeObject(contentId, `<< /Length ${content.length} >>`, content);
    writeObject(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    );
    writeObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(
        page.height,
      )}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> ` +
        `/Contents ${contentId} 0 R` +
        (annotationIds.length
          ? ` /Annots [${annotationIds.map((id) => `${id} 0 R`).join(" ")}]`
          : "") +
        " >>",
    );
  }

  writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  writeObject(
    2,
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`,
  );
  writeObject(
    3,
    `<< /Producer (notecanvas)${
      info.title ? ` /Title ${pdfTextString(info.title)}` : ""
    } >>`,
  );

  const xrefOffset = length;
  push(`xref\n0 ${nextId}\n0000000000 65535 f \n`);
  for (let id = 1; id < nextId; id++) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${nextId} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const pdf = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, position);
    position += chunk.length;
  }
  return pdf;
};
