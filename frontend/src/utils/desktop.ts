/**
 * What the NoteCanvas desktop app injects into its workspace windows
 * (NoteCanvas-App: src-tauri/src/bridge.js). Absent in a normal browser.
 */
export type DesktopBridge = {
  /** Opens the app's workspace menu. */
  openWorkspaces?: () => void;
  /**
   * This page is a local workspace: a private, single-user server on the same
   * computer. There is nobody to share with and it is never offline.
   */
  localWorkspace?: boolean;
};

export const getDesktopBridge = (): DesktopBridge | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as { notecanvasDesktop?: DesktopBridge }).notecanvasDesktop;

export const isLocalDesktopWorkspace = (): boolean =>
  getDesktopBridge()?.localWorkspace === true;
