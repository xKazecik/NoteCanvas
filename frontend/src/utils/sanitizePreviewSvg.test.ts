import { describe, expect, it } from "vitest";
import { sanitizePreviewSvg } from "./sanitizePreviewSvg";

describe("sanitizePreviewSvg", () => {
  it("keeps ordinary drawing markup", () => {
    const svg = sanitizePreviewSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="5" height="5" fill="#fff"/><text x="1" y="9">Hi &amp; bye</text></svg>',
    );
    expect(svg).toContain("<rect");
    expect(svg).toContain("Hi &amp; bye");
  });

  it("removes scripts, event handlers and foreign content", () => {
    const svg = sanitizePreviewSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><foreignObject><iframe src="https://evil.test"></iframe></foreignObject><rect onclick="alert(3)" width="1" height="1"/></svg>',
    );
    expect(svg).not.toMatch(/script|onload|onclick|foreignObject|iframe|alert/i);
    expect(svg).toContain("<rect");
  });

  it("only allows inline or own-server image sources", () => {
    const svg = sanitizePreviewSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA" width="1" height="1"/><image href="/api/files/d1/f1" width="1" height="1"/><image href="https://tracker.test/pixel.png" width="1" height="1"/><image href="javascript:alert(1)" width="1" height="1"/></svg>',
    );
    expect(svg).toContain("data:image/png;base64,AAAA");
    expect(svg).toContain("/api/files/d1/f1");
    expect(svg).not.toContain("tracker.test");
    expect(svg).not.toContain("javascript:");
  });
});
