import {
  ROUNDNESS,
  updateActiveTool,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";

import {
  BROWSER_DEFAULT_SIZE,
  CaptureUpdateAction,
  getBrowserURL,
  isBrowserBarHidden,
  isEmbeddableElement,
  isUsingAdaptiveRadius,
  newBrowserData,
  newElementWith,
  newEmbeddableElement,
} from "@excalidraw/element";

import { setCursorForShape } from "../cursor";

import type { AppClassProperties, AppState } from "../types";

import { register } from "./register";

export const actionSetEmbeddableAsActiveTool = register({
  name: "setEmbeddableAsActiveTool",
  trackEvent: { category: "toolbar" },
  target: "Tool",
  label: "toolBar.embeddable",
  perform: (elements, appState, _, app) => {
    const nextActiveTool = updateActiveTool(appState, {
      type: "embeddable",
    });

    setCursorForShape(app.canvas, {
      ...appState,
      activeTool: nextActiveTool,
    });

    return {
      elements,
      appState: {
        ...appState,
        activeTool: updateActiveTool(appState, {
          type: "embeddable",
        }),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
});

/**
 * Drop a browser element in the middle of the viewport and open the link
 * editor on it, so the next thing the user does is type the address.
 */
export const actionInsertBrowser = register({
  name: "insertBrowser",
  trackEvent: { category: "toolbar" },
  label: "toolBar.browser",
  predicate: (_elements, appState) => !appState.viewModeEnabled,
  perform: (elements, appState) => {
    const center = viewportCoordsToSceneCoords(
      {
        clientX: appState.offsetLeft + appState.width / 2,
        clientY: appState.offsetTop + appState.height / 2,
      },
      appState,
    );
    const { width, height } = BROWSER_DEFAULT_SIZE;

    const element = newEmbeddableElement({
      type: "embeddable",
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: appState.currentItemFillStyle,
      strokeWidth: appState.currentItemStrokeWidth,
      strokeStyle: appState.currentItemStrokeStyle,
      roughness: appState.currentItemRoughness,
      opacity: appState.currentItemOpacity,
      roundness:
        appState.currentItemRoundness === "round"
          ? {
              type: isUsingAdaptiveRadius("embeddable")
                ? ROUNDNESS.ADAPTIVE_RADIUS
                : ROUNDNESS.PROPORTIONAL_RADIUS,
            }
          : null,
      locked: false,
      customData: { browser: newBrowserData() },
    });

    return {
      elements: [...elements, element],
      appState: {
        ...appState,
        activeTool: updateActiveTool(appState, { type: "selection" }),
        selectedElementIds: { [element.id]: true },
        showHyperlinkPopup: "editor",
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

const getSingleBrowser = (
  appState: Readonly<AppState>,
  app: AppClassProperties,
) => {
  const selected = app.scene.getSelectedElements(appState);
  return selected.length === 1 &&
    isEmbeddableElement(selected[0]) &&
    getBrowserURL(selected[0].link)
    ? selected[0]
    : null;
};

/** Hide or bring back the address bar over a browser element's page. */
export const actionToggleBrowserBar = register({
  name: "toggleBrowserBar",
  trackEvent: { category: "element" },
  label: (_elements, appState, app) => {
    const browser = getSingleBrowser(appState, app);
    return browser && isBrowserBarHidden(browser)
      ? "labels.showBrowserBar"
      : "labels.hideBrowserBar";
  },
  predicate: (_elements, appState, _, app) =>
    !appState.viewModeEnabled && !!getSingleBrowser(appState, app),
  perform: (elements, appState, _, app) => {
    const browser = getSingleBrowser(appState, app);
    if (!browser) {
      return false;
    }
    const hideBar = !isBrowserBarHidden(browser);
    return {
      elements: elements.map((element) =>
        element.id === browser.id
          ? newElementWith(element, {
              customData: {
                ...element.customData,
                browser: { ...element.customData?.browser, hideBar },
              },
            })
          : element,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
