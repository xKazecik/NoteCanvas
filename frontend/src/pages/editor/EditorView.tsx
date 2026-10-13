import React from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Download,
  History,
  Loader2,
  Share2,
} from "lucide-react";
import clsx from "clsx";
import { Toaster } from "sonner";
import {
  LanguageSelector,
} from "../../components/LanguageSelector";
import { GridStepSelector } from "../../components/GridStepSelector";
import type { Socket } from "socket.io-client";
import { PresentationMode } from "../../components/canvas/Presentation";
import { PenToolbar } from "../../components/canvas/pens";
import {
  CommentLayer,
  useCommentThreads,
} from "../../components/canvas/comments";
import { useAuth } from "../../context/AuthContext";
import {
  CanvasSidebar,
  CanvasSidebarTrigger,
} from "../../components/canvas/CanvasSidebar";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { UserIdentity } from "../../utils/identity";
import { UIOptions } from "./shared";
import { EditorAccessBadge } from "./EditorAccessBadge";

interface Peer extends UserIdentity {
  isActive: boolean;
}

type EditorViewProps = {
  id?: string;
  accessLevel: "none" | "view" | "edit" | "owner";
  /** The owner has this drawing in offline mode, so we are read-only. */
  ownerOffline: boolean;
  autoHideEnabled: boolean;
  autosaveFailing: boolean;
  canEdit: boolean;
  drawingName: string;
  editorContainerRef: React.RefObject<HTMLDivElement>;
  initialData: any;
  isHeaderVisible: boolean;
  isRenaming: boolean;
  isSavingOnLeave: boolean;
  isSceneLoading: boolean;
  langCode: string;
  loadError: string | null;
  me: UserIdentity;
  newName: string;
  peers: Peer[];
  theme: string;
  onBackClick: () => void;
  onCanvasChange: (elements: readonly any[], appState: any, files?: Record<string, any>) => void;
  onCanvasDropCapture: (event: React.DragEvent<HTMLDivElement>) => void;
  onExportClick: () => void;
  onLibraryChange: (items: readonly any[]) => void;
  onNavigateHome: () => void;
  onNewNameChange: (value: string) => void;
  onPointerUpdate: (payload: any) => void;
  onRenameBlur: () => void;
  onRenameStart: () => void;
  onRenameSubmit: (event: React.FormEvent) => void;
  onSetExcalidrawAPI: (api: any) => void;
  onSetLangCode: (langCode: string) => void;
  gridStep: number;
  onSetGridStep: (gridStep: number) => void;
  onShareOpen: () => void;
  onHistoryOpen: () => void;
  onToggleAutoHide: () => void;
  /** The collaboration socket, so comment threads update live. */
  socketRef?: React.MutableRefObject<Socket | null>;
};

const UserAvatar = ({
  user,
  label,
  inactive = false,
}: {
  user: UserIdentity;
  label: string;
  inactive?: boolean;
}) => (
  <div className="relative group">
    <div
      className={clsx(
        "w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm transition-all duration-300",
        inactive && "opacity-30 grayscale",
      )}
      style={{ backgroundColor: user.color }}
    >
      {user.initials}
    </div>
    <div className="absolute top-full mt-2 right-0 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
      {label}
    </div>
  </div>
);

export const EditorView: React.FC<EditorViewProps> = ({
  id,
  accessLevel,
  ownerOffline,
  autoHideEnabled,
  autosaveFailing,
  canEdit,
  drawingName,
  editorContainerRef,
  initialData,
  isHeaderVisible,
  isRenaming,
  isSavingOnLeave,
  isSceneLoading,
  langCode,
  loadError,
  me,
  newName,
  peers,
  theme,
  onBackClick,
  onCanvasChange,
  onCanvasDropCapture,
  onExportClick,
  onLibraryChange,
  onNavigateHome,
  onNewNameChange,
  onPointerUpdate,
  onRenameBlur,
  onRenameStart,
  onRenameSubmit,
  onSetExcalidrawAPI,
  onSetLangCode,
  gridStep,
  onSetGridStep,
  onShareOpen,
  onHistoryOpen,
  onToggleAutoHide,
  socketRef,
}) => {
  const [canvasApi, setCanvasApi] =
    React.useState<ExcalidrawImperativeAPI | null>(null);
  const { user, authEnabled } = useAuth();
  // With authentication switched off the backend acts as the bootstrap user, so
  // comments work there even though the client has no user object. What is not
  // supported is an anonymous visitor on an instance that does have auth: the
  // comment endpoints all require a signed-in caller.
  const canUseComments = authEnabled === false || Boolean(user);

  // Comments hang off the drawing, so the state lives here and is shared by the
  // markers on the canvas and the sidebar tab that lists them.
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(
    null,
  );
  const [isPlacingComment, setIsPlacingComment] = React.useState(false);
  const comments = useCommentThreads({
    drawingId: id,
    socketRef,
    enabled: Boolean(id) && canUseComments,
  });

  return (
  <div className="h-screen flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
    <header
      className={clsx(
        "notecanvas-editor-header h-16 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 flex items-center px-4 justify-between z-10 fixed top-0 left-0 right-0 transition-transform duration-300",
        isHeaderVisible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onBackClick}
          disabled={isSavingOnLeave}
          className={`flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-wait transition-all duration-200 ${isSavingOnLeave ? "pr-4" : ""}`}
        >
          {isSavingOnLeave ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">Saving changes...</span>
            </>
          ) : (
            <ArrowLeft size={20} />
          )}
        </button>
        {isRenaming ? (
          <form onSubmit={onRenameSubmit}>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onBlur={onRenameBlur}
              className="font-medium text-gray-900 dark:text-white bg-transparent px-2 py-1 border-2 border-indigo-500 rounded-md outline-none min-w-[200px]"
              style={{ width: `${Math.max(200, newName.length * 9 + 20)}px` }}
            />
          </form>
        ) : (
          <h1
            className="font-medium text-gray-900 dark:text-white px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded cursor-text"
            onDoubleClick={onRenameStart}
          >
            {drawingName}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        {canEdit && autosaveFailing ? (
          <span
            className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 border border-red-200 dark:border-red-800"
            title="Your recent changes could not be saved. Check your connection and try again."
            role="status"
          >
            <CloudOff size={14} />
            Unsaved changes
          </span>
        ) : null}
        <EditorAccessBadge id={id} canEdit={canEdit} ownerOffline={ownerOffline} />
        {canEdit && id ? (
          <button
            onClick={onHistoryOpen}
            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
            title="Version History"
          >
            <History size={20} />
          </button>
        ) : null}
        {accessLevel === "owner" && id ? (
          <button
            onClick={onShareOpen}
            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
            title="Share"
          >
            <Share2 size={20} />
          </button>
        ) : null}
        <button
          onClick={onToggleAutoHide}
          className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
          title={autoHideEnabled ? "Disable auto-hide" : "Enable auto-hide"}
        >
          {autoHideEnabled ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
        <button
          onClick={onExportClick}
          className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
          title="Export drawing"
        >
          <Download size={20} />
        </button>
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
        <div className="flex items-center">
          <UserAvatar user={me} label={`${me.name} (You)`} />
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2" />
          <div className="flex items-center gap-2">
            {peers.map((peer) => (
              <UserAvatar
                key={peer.id}
                user={peer}
                label={peer.name}
                inactive={!peer.isActive}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
    <div
      ref={editorContainerRef}
      className="notecanvas-editor-canvas flex-1 w-full relative transition-all duration-300"
      onDropCapture={onCanvasDropCapture}
      style={{
        height: isHeaderVisible ? "calc(100vh - 4rem)" : "100vh",
        marginTop: isHeaderVisible ? "4rem" : "0",
      }}
    >
      {loadError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 px-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Unable to open drawing
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {loadError}
            </p>
          </div>
          <button
            onClick={onNavigateHome}
            className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      ) : initialData ? (
        <Excalidraw
          key={id}
          theme={theme === "dark" ? "dark" : "light"}
          langCode={langCode}
          initialData={initialData}
          onChange={onCanvasChange}
          onPointerUpdate={onPointerUpdate}
          onLibraryChange={onLibraryChange}
          excalidrawAPI={(api) => {
            onSetExcalidrawAPI(api);
            // The editor keeps the API in a ref, which never re-renders; the
            // panels below only mount once an instance actually exists.
            setCanvasApi(api);
          }}
          UIOptions={UIOptions}
          viewModeEnabled={!canEdit}
          renderTopRightUI={canEdit ? () => <CanvasSidebarTrigger /> : undefined}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Help />
            <MainMenu.Separator />
            <MainMenu.ItemCustom>
              <GridStepSelector gridStep={gridStep} onChange={onSetGridStep} />
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <LanguageSelector langCode={langCode} onChange={onSetLangCode} />
            </MainMenu.ItemCustom>
          </MainMenu>
          {/* Ported from AstraDraw. These sit inside <Excalidraw> because they
              read the editor's React context, the same way MainMenu does. */}
          {canvasApi && (
            <>
              <PresentationMode excalidrawAPI={canvasApi} />
              {canEdit && (
                <>
                  <PenToolbar excalidrawAPI={canvasApi} />
                  <CanvasSidebar
                    excalidrawAPI={canvasApi}
                    comments={
                      canUseComments
                        ? {
                            threads: comments.threads,
                            isLoading: comments.isLoading,
                            error: comments.error,
                            selectedThreadId,
                            onSelectThread: setSelectedThreadId,
                            onStartPlacing: () => {
                              setSelectedThreadId(null);
                              setIsPlacingComment(true);
                            },
                          }
                        : undefined
                    }
                  />
                </>
              )}
            </>
          )}
        </Excalidraw>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
          <span className="text-sm font-medium">
            {isSceneLoading ? "Loading drawing..." : "Preparing canvas..."}
          </span>
        </div>
      )}
      {canvasApi && id && canUseComments && (
        <CommentLayer
          drawingId={id}
          excalidrawAPI={canvasApi}
          threads={comments.threads}
          canPost={canEdit}
          currentUserId={user?.id}
          isDrawingOwner={accessLevel === "owner"}
          isPlacing={isPlacingComment}
          onPlacingChange={setIsPlacingComment}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
          onCreateThread={comments.createThread}
          onReply={comments.reply}
          onToggleResolved={comments.setResolved}
          onDelete={comments.remove}
        />
      )}
      <Toaster position="bottom-center" />
    </div>
  </div>
  );
};
