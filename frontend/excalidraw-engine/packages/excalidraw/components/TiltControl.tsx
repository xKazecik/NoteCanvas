import { t } from "../i18n";

import { useExcalidrawSetAppState } from "./App";

import "./TiltControl.scss";

/** Angles the slider settles on when dragged close to them. */
const SNAP_ANGLES = [0, 90, 180, 270, 360];
const SNAP_DISTANCE = 3;

/**
 * notecanvas: tilts the view. Sits beside the zoom buttons, since it is the
 * same kind of control: it changes how the canvas is looked at, not what is
 * on it.
 */
export const TiltControl = ({ viewAngle }: { viewAngle: number }) => {
  const setAppState = useExcalidrawSetAppState();
  const setAngle = (value: number) => {
    const snapped =
      SNAP_ANGLES.find((angle) => Math.abs(angle - value) <= SNAP_DISTANCE) ??
      value;
    // 360 is where 0 is, and keeping it at 0 keeps "untilted" a single state
    setAppState({ viewAngle: snapped % 360 });
  };

  return (
    <div className="tilt-control" title={t("labels.tiltCanvas")}>
      <input
        type="range"
        className="range-input"
        min={0}
        max={360}
        step={1}
        value={viewAngle}
        onChange={(event) => setAngle(+event.target.value)}
        aria-label={t("labels.tiltCanvas")}
        data-testid="tilt-slider"
      />
      <button
        type="button"
        className="tilt-control__reset"
        onClick={() => setAppState({ viewAngle: 0 })}
        disabled={!viewAngle}
        title={t("labels.resetTilt")}
        aria-label={t("labels.resetTilt")}
        data-testid="tilt-reset"
      >
        {Math.round(viewAngle)}°
      </button>
    </div>
  );
};
