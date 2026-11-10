import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { MessageSquare, Shapes, Smile } from "lucide-react";

import type { CommentThread } from "../../types";
import { CommentsPanel } from "./comments";
import { PresentationPanel } from "./Presentation";
import { StickersPanel } from "./Stickers";

import "./CanvasSidebar.css";

export const CANVAS_SIDEBAR_NAME = "notecanvas";
export const STICKERS_TAB = "stickers";
export const COMMENTS_TAB = "comments";
// Excalidraw's own name for the library tab of its default sidebar.
const LIBRARY_TAB = "library";

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
 * The slides sidebar: everything to do with presenting, and nothing else.
 *
 * The panel is written to fill a sidebar -- `height: 100%` and no width of its
 * own -- because AstraDraw renders it inside its own workspace sidebar. Rather
 * than rebuild that, it goes in one of Excalidraw's own sidebars, which gives
 * it width, docking and the editor's theming for free.
 */
export const CanvasSidebar = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => (
  <Sidebar name={CANVAS_SIDEBAR_NAME} className="notecanvas-canvas-sidebar" docked>
    <Sidebar.Header>
      <span className="notecanvas-canvas-sidebar__title">Slides</span>
    </Sidebar.Header>
    <PresentationPanel excalidrawAPI={excalidrawAPI} />
  </Sidebar>
);

/**
 * Opens the slides sidebar. Goes in the editor's top-right area, next to the
 * Elements trigger.
 */
export const CanvasSidebarTrigger = () => (
  <Sidebar.Trigger name={CANVAS_SIDEBAR_NAME} title="Slides">
    Slides
  </Sidebar.Trigger>
);

/**
 * Excalidraw's default sidebar (search and library), shown as "Elements" and
 * extended with the things you put on a canvas that are not slides: stickers
 * and comments.
 */
export const ElementsSidebar = ({
  excalidrawAPI,
  comments,
}: {
  /**
   * Null until the editor has mounted. This component must not wait for it:
   * Excalidraw only stands down its own library sidebar and trigger for a
   * replacement that is there on the editor's first render.
   */
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  comments?: CanvasSidebarComments;
}) => (
  <>
    <DefaultSidebar.Trigger
      icon={<Shapes />}
      title="Elements"
      tab={LIBRARY_TAB}
    >
      Elements
    </DefaultSidebar.Trigger>
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger tab={STICKERS_TAB} title="Stickers">
          <Smile />
        </Sidebar.TabTrigger>
        {comments && (
          <Sidebar.TabTrigger tab={COMMENTS_TAB} title="Comments">
            <MessageSquare />
          </Sidebar.TabTrigger>
        )}
      </DefaultSidebar.TabTriggers>
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
    </DefaultSidebar>
  </>
);
