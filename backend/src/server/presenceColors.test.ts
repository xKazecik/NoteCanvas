import { describe, expect, it } from "vitest";
import {
  PRESENCE_COLORS,
  pickPresenceColor,
} from "./presenceColors";

describe("pickPresenceColor", () => {
  it("picks from the palette when the room is empty", () => {
    expect(PRESENCE_COLORS).toContain(pickPresenceColor([]));
  });

  it("never reuses a colour someone in the room already holds", () => {
    const taken: string[] = [];
    for (let i = 0; i < PRESENCE_COLORS.length; i += 1) {
      const color = pickPresenceColor(taken);
      expect(taken).not.toContain(color);
      taken.push(color);
    }
    expect(new Set(taken).size).toBe(PRESENCE_COLORS.length);
  });

  it("matches taken colours regardless of the case they were stored in", () => {
    const taken = PRESENCE_COLORS.slice(0, 11).map((c) => c.toUpperCase());
    expect(pickPresenceColor(taken)).toBe(PRESENCE_COLORS[11]);
  });

  it("keeps handing out unused colours once the palette is exhausted", () => {
    const taken = [...PRESENCE_COLORS];
    for (let i = 0; i < 8; i += 1) {
      const color = pickPresenceColor(taken);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(taken).not.toContain(color);
      taken.push(color);
    }
  });

  it("spreads over the whole palette rather than favouring one entry", () => {
    // The randomFraction seam lets the test pin both ends of the range.
    expect(pickPresenceColor([], () => 0)).toBe(PRESENCE_COLORS[0]);
    expect(pickPresenceColor([], () => 0.999)).toBe(
      PRESENCE_COLORS[PRESENCE_COLORS.length - 1],
    );
    // A fraction of exactly 1 must not index past the end of the list.
    expect(PRESENCE_COLORS).toContain(pickPresenceColor([], () => 1));
  });
});
