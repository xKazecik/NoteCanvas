import { LOCAL_FONT_PROTOCOL } from "@excalidraw/common";

import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

/**
 * notecanvas: the everyday document fonts -- Arial, Times New Roman and the
 * like. They are proprietary and cannot be shipped, so they are used from the
 * system the way Helvetica already is. Windows and macOS have them all; where
 * one is missing the text falls back to the generic family it belongs to
 * (sans-serif, serif or monospace) rather than to a hand-drawn face.
 */
export const SystemFontFaces: ExcalidrawFontFaceDescriptor[] = [
  { uri: LOCAL_FONT_PROTOCOL },
];
