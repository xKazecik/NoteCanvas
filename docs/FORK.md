# Fork notes

notecanvas is [ExcaliDash](https://github.com/ZimengXiong/ExcaliDash) with the
Excalidraw canvas replaced by [AstraDraw](https://github.com/AstraDraw/astradraw)'s
fork of it. This file records what that took, so the next person pulling from
either upstream knows which changes are ours and why they exist.

## Where the pieces come from

| Path | Origin |
| --- | --- |
| `backend/`, most of `frontend/src/` | ExcaliDash |
| `frontend/excalidraw-engine/` | AstraDraw `packages/{common,element,math,excalidraw,utils}`, verbatim except for the changes below |
| `frontend/src/components/canvas/` | AstraDraw `excalidraw-app/components/{Presentation,Stickers}`, imports rewritten |
| `frontend/src/styles/_mixins.scss` | AstraDraw `excalidraw-app/styles/_mixins.scss`, verbatim |

## Why the engine is vendored rather than installed

ExcaliDash depends on the published `@excalidraw/excalidraw`. AstraDraw does not
publish its fork; it keeps it in its own monorepo and its app aliases the package
name to that source tree. To get AstraDraw's canvas, notecanvas vendors those
packages and builds them from source as npm workspaces of `frontend/`.

`frontend/package.json` declares `excalidraw-engine/packages/*` as workspaces, so
`@excalidraw/excalidraw` resolves to the vendored copy instead of the registry.
`npm run build:engine` builds them in dependency order before Vite runs.

## Changes to the vendored engine

Kept as small as possible, so a future re-vendor from AstraDraw is mostly a copy.

- **Build scripts renamed to `.cjs`** (`excalidraw-engine/scripts/`). They are
  CommonJS, and `frontend/package.json` is `"type": "module"`, so `.js` would be
  loaded as ESM and `require` would be undefined.
- **`yarn gen:types` → `npm run gen:types`** in each package's `build:esm`.
  This tree is built with npm; yarn is not available.
- **`TTDDialogOutput`'s `canvasRef`** typed as `React.RefObject<HTMLDivElement>`
  rather than `RefObject<HTMLDivElement | null>`. AstraDraw builds against React
  19 types, ExcaliDash uses React 18, and this was the only incompatibility in
  the whole engine. The package's peer range already allows React 18.
- **Extra exports at the end of `packages/excalidraw/index.tsx`** — `Dialog`,
  `TextField`, `t`, `TranslationKeys` and a few icons. See below.

## Why the ported UI imports from the package root

AstraDraw's app aliases `@excalidraw/excalidraw` to the engine *source*, so it can
deep-import `@excalidraw/excalidraw/components/Dialog` and friends. notecanvas
consumes the *built* package. Resolving some imports to the build and others to
the source would load two copies of the editor, each with its own React context
and jotai store, and the ported panels would not see the editor they are mounted
inside.

So the engine exports what the ported UI needs, and the ported components import
it from `@excalidraw/excalidraw`. When porting more of AstraDraw's app shell, add
an export there rather than reaching into the source tree.

The panels mount as children of `<Excalidraw>` in
`frontend/src/pages/editor/EditorView.tsx`, which is where AstraDraw mounts them
too and where the editor's context is available.

## Things that bite

- **Build the engine from clean.** `build:engine` wipes every engine `dist`
  first. A leftover `dist/types` is picked up alongside the sources it was
  generated from, which duplicates the global declarations in `App.tsx` and fails
  with TS2717 — a rebuild fails where a clean build succeeds.
- **`utils` is not built standalone**, matching AstraDraw's own `build:packages`.
  The excalidraw bundle inlines it from source, and building it needs Python
  `fonttools`.
- **`esbuild` and `esbuild-sass-plugin` are declared in `frontend/package.json`,**
  not in the engine packages. Node resolves them from the build script's own
  directory, so they have to be reachable from `frontend/`.
- **`frontend/excalidraw-engine/.env.production` is force-included** in
  `.gitignore`. The engine's build scripts read it, and the repo-wide
  `.env.production` rule would otherwise drop it.

## Features added here, in neither upstream

- **Stackable collections.** `Collection.parentId` self-relation, with
  migrations under both `backend/prisma/migrations/sqlite/` and
  `postgresql/`. Deleting a collection promotes its children to the deleted
  collection's own parent, so a subtree is never lost with its folder. Moving a
  collection into its own subtree is rejected — it would cut the subtree out of
  the tree by making a cycle.
- **Runtime frontend config.** `docker/entrypoint.sh` writes
  `/usr/share/nginx/html/env.js` on every container start, and nginx serves it
  with `no-store`. Currently carries `GIPHY_API_KEY`. Bear in mind anything put
  there reaches the browser.

## Re-vendoring the engine from AstraDraw

1. Copy `packages/{common,element,math,excalidraw,utils}` from
   `AstraDraw/astradraw-app` over `frontend/excalidraw-engine/packages/`,
   excluding `node_modules`, `dist` and `types`.
2. Copy `scripts/{buildBase,buildPackage,buildUtils}.js` and `scripts/woff2/`,
   renaming the `.js` files to `.cjs` and fixing the `require` of
   `woff2-esbuild-plugins`.
3. Re-apply the four engine changes listed above.
4. `npm install && npm run build` in `frontend/`.
