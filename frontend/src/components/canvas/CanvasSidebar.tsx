import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { PresentationPanel } from "./Presentation";
import { StickersPanel } from "./Stickers";

import "./CanvasSidebar.css";

export const CANVAS_SIDEBAR_NAME = "notecanvas";
export const SLIDES_TAB = "slides";
export const STICKERS_TAB = "stickers";

/**
 * Hosts the panels ported from AstraDraw.
 *
 * They are written to fill a sidebar -- `height: 100%` and no width of their
 * own -- because AstraDraw renders them inside its own workspace sidebar.
 * Rather than rebuild that, they go in one of Excalidraw's own sidebars, which
 * gives them width, docking and the editor's theming for free.
 */
export const CanvasSidebar = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => (
  <Sidebar name={CANVAS_SIDEBAR_NAME} className="notecanvas-canvas-sidebar" docked>
    <Sidebar.Tabs>
      <Sidebar.Header>
        <Sidebar.TabTriggers>
          <Sidebar.TabTrigger tab={SLIDES_TAB}>Slides</Sidebar.TabTrigger>
          <Sidebar.TabTrigger tab={STICKERS_TAB}>Stickers</Sidebar.TabTrigger>
        </Sidebar.TabTriggers>
      </Sidebar.Header>
      <Sidebar.Tab tab={SLIDES_TAB}>
        <PresentationPanel excalidrawAPI={excalidrawAPI} />
      </Sidebar.Tab>
      <Sidebar.Tab tab={STICKERS_TAB}>
        <StickersPanel excalidrawAPI={excalidrawAPI} />
      </Sidebar.Tab>
    </Sidebar.Tabs>
  </Sidebar>
);

/**
 * Opens the sidebar above. Goes in the editor's top-right area, next to
 * Excalidraw's own library trigger.
 */
export const CanvasSidebarTrigger = () => (
  <Sidebar.Trigger
    name={CANVAS_SIDEBAR_NAME}
    tab={SLIDES_TAB}
    title="Slides and stickers"
  >
    Slides
  </Sidebar.Trigger>
);
