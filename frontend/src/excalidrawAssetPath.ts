// Tells Excalidraw where its fonts are served from (scripts/copy-excalidraw-assets.mjs
// copies them into the site root). This used to be an inline <script> in
// index.html, which the Content-Security-Policy (script-src 'self') blocks;
// main.tsx imports this module first instead.
const target = window as { EXCALIDRAW_ASSET_PATH?: string | string[] };

if (!target.EXCALIDRAW_ASSET_PATH) {
  target.EXCALIDRAW_ASSET_PATH = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export {};
