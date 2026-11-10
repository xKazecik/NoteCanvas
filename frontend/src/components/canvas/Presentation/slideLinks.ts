// From the element package rather than the editor's root: this module is pure
// geometry, and stays loadable where the editor itself is not (the tests).
import { getCommonBounds } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
} from "@excalidraw/element/types";

import type { PdfLink } from "./pdfWriter";

/** Addresses a PDF viewer can open; links to other elements are not. */
const isWebLink = (link: string | null): link is string =>
  !!link && /^(https?:\/\/|mailto:)/i.test(link);

/**
 * Where the links on a slide go on its page: every element carrying a web
 * address (a linked shape, or an embedded page or browser, which cannot be
 * live in a PDF), as the part of its bounding box that falls inside the slide.
 */
export const getSlideLinks = (
  frame: Pick<ExcalidrawFrameLikeElement, "x" | "y" | "width" | "height"> &
    Partial<Pick<ExcalidrawFrameLikeElement, "angle">>,
  elements: readonly ExcalidrawElement[],
  pageScale: number,
): PdfLink[] => {
  // a rotated slide is printed level, so links are measured along its axes
  const angle = frame.angle ?? 0;
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  const toFrame = ([x, y]: [number, number]): [number, number] => {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return [
      cx + (x - cx) * cos - (y - cy) * sin,
      cy + (x - cx) * sin + (y - cy) * cos,
    ];
  };
  const links: PdfLink[] = [];
  for (const element of elements) {
    if (element.isDeleted || !isWebLink(element.link)) {
      continue;
    }
    const [bx1, by1, bx2, by2] = getCommonBounds([element]);
    const corners = (
      [
        [bx1, by1],
        [bx2, by1],
        [bx2, by2],
        [bx1, by2],
      ] as [number, number][]
    ).map(toFrame);
    const x1 = Math.min(...corners.map(([x]) => x));
    const y1 = Math.min(...corners.map(([, y]) => y));
    const x2 = Math.max(...corners.map(([x]) => x));
    const y2 = Math.max(...corners.map(([, y]) => y));
    const left = Math.max(x1, frame.x);
    const top = Math.max(y1, frame.y);
    const right = Math.min(x2, frame.x + frame.width);
    const bottom = Math.min(y2, frame.y + frame.height);
    if (right <= left || bottom <= top) {
      continue;
    }
    links.push({
      x: (left - frame.x) * pageScale,
      y: (top - frame.y) * pageScale,
      width: (right - left) * pageScale,
      height: (bottom - top) * pageScale,
      url: element.link,
    });
  }
  return links;
};
