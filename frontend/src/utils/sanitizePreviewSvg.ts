import DOMPurify from "dompurify";

// Client-side twin of the backend's sanitizeSvg (backend/src/security.ts).
// Previews from the server are sanitized there on save; a preview generated in
// this browser for a board kept offline never went through it, yet the
// dashboard injects it as HTML. Same allowlist, so both render the same way.

const SAFE_IMAGE_HREF =
  /^(?:data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,[a-z0-9+/=\s]+|\/api\/files\/[\w-]+\/[\w-]+)$/i;

const ALLOWED_TAGS = [
  "svg", "defs", "pattern", "g", "image", "rect", "circle", "ellipse", "line",
  "polyline", "polygon", "path", "text", "tspan",
];

const ALLOWED_ATTR = [
  "xmlns", "xmlns:xlink", "version", "id", "viewBox", "preserveAspectRatio",
  "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2",
  "y2", "points", "d", "fill", "fill-opacity", "fill-rule", "stroke",
  "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity",
  "transform", "vector-effect", "patternUnits", "patternContentUnits",
  "font-size", "font-family", "font-weight", "letter-spacing", "text-anchor",
  "dominant-baseline", "href", "xlink:href",
];

export const sanitizePreviewSvg = (svg: string): string => {
  const fragment = DOMPurify.sanitize(svg, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: true,
  });
  // Images may only point at inline image data or our own file endpoint.
  fragment.querySelectorAll("image").forEach((image) => {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href") ?? "";
    if (!SAFE_IMAGE_HREF.test(href.trim())) image.remove();
  });
  // Links of any kind are not part of a thumbnail.
  fragment.querySelectorAll("[href]:not(image), [xlink\\:href]:not(image)").forEach((el) => {
    el.removeAttribute("href");
    el.removeAttribute("xlink:href");
  });
  const container = document.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML.trim();
};
