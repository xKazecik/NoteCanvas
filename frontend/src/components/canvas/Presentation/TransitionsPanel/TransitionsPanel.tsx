import { t } from "@excalidraw/excalidraw";

import type { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  SLIDE_TRANSITIONS,
  getSlideTransition,
  setSlideTransition,
} from "../slideTransitions";

import styles from "./TransitionsPanel.module.scss";

import type { SlideTransition } from "../slideTransitions";

/**
 * One row per step of the presentation (slide 1 → 2, 2 → 3, …) with the
 * animation that plays between them. The choice is stored on the later slide.
 */
export const TransitionsPanel = ({
  frames,
  excalidrawAPI,
}: {
  frames: ExcalidrawFrameLikeElement[];
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  if (frames.length < 2) {
    return null;
  }

  return (
    <div className={styles.transitions} onWheel={(e) => e.stopPropagation()}>
      <div className={styles.heading}>{t("presentation.transitions")}</div>
      {frames.slice(1).map((frame, index) => (
        <label key={frame.id} className={styles.row}>
          <span className={styles.pair}>
            {index + 1} → {index + 2}
          </span>
          <select
            className={styles.select}
            value={getSlideTransition(frame)}
            onChange={(event) =>
              setSlideTransition(
                excalidrawAPI,
                frame.id,
                event.target.value as SlideTransition,
              )
            }
          >
            {SLIDE_TRANSITIONS.map((transition) => (
              <option key={transition.id} value={transition.id}>
                {t(transition.label)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
};
