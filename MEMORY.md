# Memory

Working notes for agents. Read alongside `README.md` and `REQUIREMENTS.md`.

## Status

Core and the visual editor are both implemented and verified end-to-end against
a local Signal K server.

- **Backend.** Read-only `symbols` resource provider, manager CRUD API, SQLite
  storage, SVG sanitization, public asset serving, and the 4 starter templates.
- **List-manager UI.** New-from-template, edit, upload, duplicate, delete, and a
  Freeboard-size preview.
- **Visual editor** (`FabricEditor.tsx`, used for New/Edit; upload uses the
  simpler `SymbolForm.tsx`). Canvas SVG load, draggable anchor-point overlay
  (editor-only, `excludeFromExport`), shape tools (rect/circle/line/arrow/text/
  polygon-polyline), contextual shape properties (X/Y/W/H, fill/outline/
  outline-width, opacity, reorder, delete, POI body-fit), z-order click-cycling
  (on click-without-drag), import-shape (sanitized → grouped), zoom + pan
  (shift-drag / wheel) / fit, undo (Cmd/Ctrl-Z), raw-SVG view/edit, and
  export→sanitize→save. Shared metadata lives in `MetadataFields.tsx`.
- **Editable identity.** `id` and `namespace` are editable when editing an
  existing symbol; a save that changes either triggers a backend **rename**
  (`store.rename`) that moves the SVG asset on disk and rewrites the SQLite
  primary key. Duplicate uses a two-field dialog (`DuplicateDialog.tsx`, id +
  namespace) so the same id can be reused under a different namespace.
- **GPX mapping.** Each symbol carries optional free-form `gpxType` / `gpxSym`
  strings (map to a GPX waypoint `<type>` / `<sym>`). Stored in SQLite, edited
  in the "GPX mapping" fieldset of `MetadataFields.tsx`, and emitted on the
  public resource shape only when non-empty (same treatment as `description`).
  Per user decision they ARE part of the public `symbols` API and are documented
  in `symbols-api.md`.

Editor gotchas:

- The app is NOT wrapped in `<React.StrictMode>` (see `main.tsx`). StrictMode's
  dev double-invoke mounts/disposes the Fabric canvas twice and corrupts it
  (edits silently dropped on export). Production React never double-invokes, so
  this was dev-only, but StrictMode is removed so dev==prod.
- W/H edits scale by desired/current *scaled* size (stroke-inclusive), not
  `W/width`, so they're exact.

## Key decisions

- **Asset path lives OUTSIDE `/plugins`.** The server gates all `/plugins/*`
  behind *admin* auth and ignores `allow_readonly`, so a `/plugins/...svg` asset
  would not be loadable by read-only consumers. Assets are served at
  `/signalk/symbol-manager/symbols/:ref.svg` (registered on the app, like
  chart-tile plugins) and that is the `url` in every resource. This is now the
  documented requirement in `REQUIREMENTS.md` (it began as a divergence from an
  earlier draft route the user approved changing).
- **Auth is handled by the server, not the plugin.** The manager API under
  `/plugins/signalk-symbol-manager/api` is admin-gated by the server's global
  `/plugins` middleware, so the plugin adds no auth of its own. Provider
  `setResource`/`deleteResource` always reject (read-only).
- **`id`/`namespace` are mutable on edit.** SQLite has no row-rename, so
  `store.rename` does `UPDATE ... SET namespace/id/svgFile` plus an
  `fs.renameSync` of the asset, and rejects (409) if the new identity is taken.
  The service runs the rename before the metadata update when a save carries a
  changed id/namespace.
- **SVG sanitizer is jsdom-free.** Uses `@xmldom/xmldom` (pure JS) with a strict
  element allowlist + attribute scrubbing (`src/sanitize.ts`), NOT DOMPurify.
  Reason: DOMPurify needs jsdom, which leaks at the native/realm level
  (~17–35 KB per `sanitize` call, unfixable by `window.close()`/recycling) and
  is heavy for a Pi. The xmldom allowlist is leak-free (0.6 MB heap growth over
  5000 calls vs 191 MB) and ~75 MB lighter RSS. We own the sanitizer's security
  correctness; `test/sanitize.test.js` covers the vectors (script, foreignObject,
  on*, external href/url, javascript:, `<style>` CSS, `<!ENTITY>`/XXE, size).

## Known environment issue (NOT the plugin)

- The local `bin/n2k-from-file` SK server OOMs/aborts (`Abort trap: 6`) after
  ~10–15 min on a noisy LAN. **Root cause identified:** `@astronautlabs/mdns`
  (introduced upstream in PR #2601) caches every mDNS record from the wire with
  no size cap; on a home LAN with many Apple devices the cache fills heap.
  Reported as [SignalK/signalk-server#2761](https://github.com/SignalK/signalk-server/issues/2761).
  **Workaround applied:** `"mdns": false` is now set in
  `signalk-server-node/settings/n2k-from-file-settings.json`. Do not remove it
  until the upstream issue is resolved. This is not a plugin bug.

## Build / run gotchas

- Use Node 24 from nvm. The machine's `/usr/local/bin/npm` is an ancient 6.9
  that fails; use `~/.nvm/versions/node/v24.16.0/bin/npm` (npm 11) or put nvm
  first on `PATH`. `node:sqlite` works under this node.
- Backend: `src/` → `plugin/` via `tsc`. UI: `web/` → `public/` via Vite
  (`base` is `/signalk-symbol-manager/` for build, `/` for `npm run dev`, which
  proxies `/plugins` and `/signalk` to `localhost:3000`). Both `plugin/` and the
  built `public/*` are gitignored and rebuilt by `prepare`.
- Local verify: link into `~/.signalk/node_modules`, pre-enable via
  `~/.signalk/plugin-config-data/signalk-symbol-manager.json`, launch with
  `SIGNALK_NODE_CONFIG_DIR=$HOME/.signalk PORT=3000 bin/n2k-from-file` from
  `signalk-server-node`. There are two live test DBs:
  `~/.signalk/plugin-config-data/signalk-symbol-manager/symbols.sqlite` and
  `signalk-server-node/plugin-config-data/signalk-symbol-manager/symbols.sqlite`.
- **No DB migration system** (pre-release). The schema is created by
  `CREATE TABLE IF NOT EXISTS` on first run; existing tables are NOT altered.
  When you add a column, new DBs get it automatically but existing test DBs need
  a manual one-off `ALTER TABLE symbols ADD COLUMN ...` (stop the server first).
  Both DBs above already have `gpxType` / `gpxSym` added this way.

## Tests

- `npm test` builds the backend and runs `node:test` suites in `test/`
  (symbolKey, sanitize, service) — 34 tests. `test/service.test.js` covers
  create/update/delete, unqualified-id ambiguity, asset-url qualification,
  id/namespace rename (asset move + 409 on collision), duplicate (incl. reusing
  an id under a new namespace), and the `gpxType`/`gpxSym` round-trip
  (create → public-resource exposure → empty-omission → update → duplicate).
