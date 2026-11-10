import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installSliderWheel, steppedValue } from "../sliderWheel";

const slider = (attrs: Record<string, string>) => {
  const input = document.createElement("input");
  input.type = "range";
  for (const [name, value] of Object.entries(attrs)) {
    input.setAttribute(name, value);
  }
  document.body.appendChild(input);
  return input;
};

const wheel = (target: Element, deltaY: number, deltaMode = 0) => {
  const event = new WheelEvent("wheel", {
    deltaY,
    deltaMode,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
};

describe("steppedValue", () => {
  it("moves one step and stays on the step grid", () => {
    const input = slider({ min: "0.25", max: "8", step: "0.25", value: "1" });
    expect(steppedValue(input, 1)).toBe(1.25);
    expect(steppedValue(input, -1)).toBe(0.75);
    input.value = "1.1";
    expect(steppedValue(input, 1)).toBe(1.25);
  });

  it("stops at the ends", () => {
    const input = slider({ min: "0", max: "360", step: "1", value: "360" });
    expect(steppedValue(input, 1)).toBe(360);
    input.value = "0";
    expect(steppedValue(input, -1)).toBe(0);
  });
});

describe("scrolling over a slider", () => {
  let uninstall: () => void;
  beforeEach(() => {
    uninstall = installSliderWheel();
  });
  afterEach(() => {
    uninstall();
    document.body.innerHTML = "";
  });

  it("moves it a single step per wheel notch, up for more", () => {
    const input = slider({ min: "0", max: "100", step: "10", value: "50" });
    const onInput = vi.fn();
    input.addEventListener("input", onInput);

    const event = wheel(input, -100);
    expect(input.value).toBe("60");
    expect(onInput).toHaveBeenCalledTimes(1);
    // and the page does not scroll
    expect(event.defaultPrevented).toBe(true);

    wheel(input, 120);
    expect(input.value).toBe("50");
  });

  it("adds trackpad scrolling up to one step", () => {
    const input = slider({ min: "0", max: "10", step: "1", value: "5" });
    wheel(input, -20);
    wheel(input, -20);
    expect(input.value).toBe("5");
    wheel(input, -20);
    expect(input.value).toBe("6");
  });

  it("leaves disabled sliders and everything else alone", () => {
    const input = slider({ min: "0", max: "10", value: "5", disabled: "" });
    expect(wheel(input, -100).defaultPrevented).toBe(false);
    expect(input.value).toBe("5");
    expect(wheel(document.body, -100).defaultPrevented).toBe(false);
  });
});
