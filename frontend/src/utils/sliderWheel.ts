/**
 * Scrolling over a slider moves it one step: up or right for more, down or
 * left for less. One listener for the whole page, so every slider gets it --
 * the app's own and the ones inside the canvas editor -- without each having
 * to opt in.
 */

/** A mouse wheel notch is at least this many pixels; trackpads send less. */
const NOTCH_PX = 50;

/** Trackpad scrolling, added up until it amounts to one notch. */
let pending = 0;
let pendingSlider: HTMLInputElement | null = null;

const decimals = (value: number) => {
  const text = String(value);
  return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
};

/** The value one step from the slider's current one, kept on its step grid. */
export const steppedValue = (slider: HTMLInputElement, direction: 1 | -1) => {
  const min = slider.min === "" ? 0 : Number(slider.min);
  const max = slider.max === "" ? 100 : Number(slider.max);
  const step =
    slider.step === "" || slider.step === "any"
      ? slider.step === "any"
        ? (max - min) / 100
        : 1
      : Number(slider.step);
  const current = Number(slider.value);
  // snap to the grid the slider itself uses, so repeated steps don't drift
  const onGrid = min + Math.round((current - min) / step + direction) * step;
  const next = Math.min(max, Math.max(min, onGrid));
  return Number(next.toFixed(Math.max(decimals(step), decimals(min))));
};

/** Set a slider's value the way a user would, so React's onChange runs. */
const setSliderValue = (slider: HTMLInputElement, value: number) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(slider, String(value));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
};

export const handleSliderWheel = (event: WheelEvent) => {
  const target = event.target instanceof Element ? event.target : null;
  const slider = target?.closest<HTMLInputElement>('input[type="range"]');
  if (!slider || slider.disabled) return;

  // the page (or the canvas under it) must not scroll or zoom as well
  event.preventDefault();
  event.stopPropagation();

  const delta =
    Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? -event.deltaY
      : event.deltaX;
  if (!delta) return;

  // line- and page-based deltas are always whole notches
  const pixels = event.deltaMode === 0 ? delta : delta * NOTCH_PX;
  if (Math.abs(pixels) >= NOTCH_PX) {
    pending = 0;
  } else {
    if (pendingSlider !== slider || Math.sign(pending) !== Math.sign(pixels)) {
      pending = 0;
    }
    pendingSlider = slider;
    pending += pixels;
    if (Math.abs(pending) < NOTCH_PX) return;
    pending = 0;
  }

  const next = steppedValue(slider, pixels > 0 ? 1 : -1);
  if (next !== Number(slider.value)) setSliderValue(slider, next);
};

export const installSliderWheel = () => {
  // capture, so this runs before the canvas's own wheel handling
  window.addEventListener("wheel", handleSliderWheel, {
    capture: true,
    passive: false,
  });
  return () =>
    window.removeEventListener("wheel", handleSliderWheel, { capture: true });
};
