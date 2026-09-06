import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { CommentThread } from "../../types";
import { CommentsPanel } from "./comments";
import { PresentationPanel } from "./Presentation";
import { StickersPanel } from "./Stickers";

import "./CanvasSidebar.css";

export const CANVAS_SIDEBAR_NAME = "notecanvas";
export const SLIDES_TAB = "slides";
export const STICKERS_TAB = "stickers";
export const COMMENTS_TAB = "comments";

/**
 * Comment state lives in the editor, because the canvas markers and this panel
 * show the same threads. Absent for an anonymous link-share visitor, who cannot
 * read comments.
 */
export type CanvasSidebarComments = {
  threads: CommentThread[];
  isLoading: boolean;
  error: string | null;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onStartPlacing: () => void;
};

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
  comments,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  comments?: CanvasSidebarComments;
}) => (
  <Sidebar name={CANVAS_SIDEBAR_NAME} className="notecanvas-canvas-sidebar" docked>
    <Sidebar.Tabs>
      <Sidebar.Header>
        <Sidebar.TabTriggers>
          <Sidebar.TabTrigger tab={SLIDES_TAB}>Slides</Sidebar.TabTrigger>
          <Sidebar.TabTrigger tab={STICKERS_TAB}>Stickers</Sidebar.TabTrigger>
          {comments && (
            <Sidebar.TabTrigger tab={COMMENTS_TAB}>Comments</Sidebar.TabTrigger>
          )}
        </Sidebar.TabTriggers>
      </Sidebar.Header>
      <Sidebar.Tab tab={SLIDES_TAB}>
        <PresentationPanel excalidrawAPI={excalidrawAPI} />
      </Sidebar.Tab>
      <Sidebar.Tab tab={STICKERS_TAB}>
        <StickersPanel excalidrawAPI={excalidrawAPI} />
      </Sidebar.Tab>
      {comments && (
        <Sidebar.Tab tab={COMMENTS_TAB}>
          <CommentsPanel
            threads={comments.threads}
            isLoading={comments.isLoading}
            error={comments.error}
            canPost
            selectedThreadId={comments.selectedThreadId}
            onSelectThread={comments.onSelectThread}
            onStartPlacing={comments.onStartPlacing}
          />
        </Sidebar.Tab>
      )}
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
