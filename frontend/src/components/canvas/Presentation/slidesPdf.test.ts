import { describe, expect, it } from "vitest";
import { newElement, newEmbeddableElement } from "@excalidraw/element";

import { buildPdf } from "./pdfWriter";
import { getSlideExportElements, slideExportAppState } from "./slideContent";
import { getSlideLinks } from "./slideLinks";

const text = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

const page = (links = [] as { url: string }[]) => ({
  width: 960,
  height: 540,
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  pixelWidth: 1920,
  pixelHeight: 1080,
  links: links.map((link) => ({ x: 96, y: 54, width: 192, height: 108, ...link })),
});

describe("buildPdf", () => {
  it("writes one page per slide, each showing its picture", () => {
    const pdf = text(buildPdf([page(), page()], { title: "Deck" }));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Pages /Count 2");
    expect(pdf.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);
    expect(pdf).toContain("/MediaBox [0 0 960 540]");
  });

  it("points every cross-reference entry at its object", () => {
    const bytes = buildPdf([page([{ url: "https://example.com" }])]);
    const pdf = text(bytes);
    const xref = pdf.slice(Number(pdf.match(/startxref\n(\d+)/)![1]));
    const entries = [...xref.matchAll(/(\d{10}) 00000 n /g)];
    expect(entries.length).toBeGreaterThan(5);
    entries.forEach((entry, index) => {
      expect(pdf.slice(Number(entry[1])).startsWith(`${index + 1} 0 obj`)).toBe(
        true,
      );
    });
  });

  it("turns links into annotations, measured from the bottom of the page", () => {
    const pdf = text(buildPdf([page([{ url: "https://example.com/a(b)" }])]));
    expect(pdf).toContain("/Subtype /Link /Rect [96 378 288 486]");
    expect(pdf).toContain("/URI (https://example.com/a\\(b\\))");
    expect(pdf).toMatch(/\/Annots \[\d+ 0 R\]/);
  });
});

describe("getSlideLinks", () => {
  const frame = { x: 100, y: 100, width: 480, height: 270 };
  const rect = (x: number, y: number, link: string | null) =>
    newElement({ type: "rectangle", x, y, width: 100, height: 50, link });

  it("places a linked element relative to its slide, scaled to the page", () => {
    expect(
      getSlideLinks(frame, [rect(200, 150, "https://example.com")], 2),
    ).toEqual([
      { x: 200, y: 100, width: 200, height: 100, url: "https://example.com" },
    ]);
  });

  it("includes embedded pages and browsers, which carry their address", () => {
    const browser = newEmbeddableElement({
      type: "embeddable",
      x: 120,
      y: 120,
      width: 200,
      height: 100,
      link: "https://docs.example.com",
    });
    expect(getSlideLinks(frame, [browser], 1)[0].url).toBe(
      "https://docs.example.com",
    );
  });

  it("clips a link to the slide and drops ones outside it", () => {
    const links = getSlideLinks(
      frame,
      [
        rect(550, 100, "https://edge.example"),
        rect(900, 900, "https://far.example"),
      ],
      1,
    );
    expect(links).toEqual([
      { x: 450, y: 0, width: 30, height: 50, url: "https://edge.example" },
    ]);
  });

  it("measures links along a rotated slide's own axes", () => {
    // a 200x100 slide turned a quarter turn about its centre (150, 100)
    const turned = { x: 50, y: 50, width: 200, height: 100, angle: Math.PI / 2 };
    // a square at the slide's centre stays at its centre
    const [link] = getSlideLinks(
      turned,
      [
        {
          ...rect(140, 90, "https://centre.example"),
          width: 20,
          height: 20,
        },
      ],
      1,
    );
    expect(link.x).toBeCloseTo(90);
    expect(link.y).toBeCloseTo(40);
    expect(link.width).toBeCloseTo(20);
  });

  it("ignores links that only work inside the app", () => {
    expect(
      getSlideLinks(frame, [rect(200, 150, "/editor/abc?element=1")], 1),
    ).toEqual([]);
  });
});

describe("what a slide shows", () => {
  const inFrame = (id: string, frameId: string | null) =>
    ({ ...newElement({ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }), id, frameId });

  it("releases elements of other frames, such as a frame nested in the slide", () => {
    const elements = [
      inFrame("own", "slide"),
      inFrame("nested-child", "inner-frame"),
      inFrame("loose", null),
    ];
    expect(
      getSlideExportElements(elements, "slide").map((element) => element.frameId),
    ).toEqual(["slide", null, null]);
  });

  it("follows the canvas theme and keeps its background", () => {
    expect(
      slideExportAppState({ theme: "dark", viewBackgroundColor: "#000000" }),
    ).toMatchObject({
      exportBackground: true,
      exportWithDarkMode: true,
      viewBackgroundColor: "#000000",
    });
    expect(slideExportAppState({ theme: "light" }).exportWithDarkMode).toBe(false);
  });
});
