# Memory

Working notes for agents. Read alongside `README.md` and `REQUIREMENTS.md`.

## Status

- **Phase 1 (core) — DONE and verified end-to-end against a local Signal K
  server.** Resource provider, manager API, SQLite storage, SVG sanitization,
  public asset serving, the 4 templates, and the React list-manager UI
  (new-from-template, metadata edit, upload, duplicate, delete,
  Freeboard-size preview) are implemented and working.
- **Phase 2 (rich Fabric.js visual editor) — IMPLEMENTED.** `FabricEditor.tsx`
  (used for New/Edit; upload still uses the simpler `SymbolForm`). Provides:
  canvas SVG load, draggable anchor-point overlay (editor-only,
  `excludeFromExport`), shape tools (rect/circle/line/arrow/text), contextual
  shape properties (X/Y/W/H, fill/outline/outline-width, reorder, delete,
  POI body-fit), z-order click-cycling (on click-without-drag), import-shape
  (sanitized → grouped), zoom/fit, raw-SVG view/edit, and export→sanitize→save.
  Shared metadata moved to `MetadataFields.tsx`.
  - **Gotcha:** the app is NOT wrapped in `<React.StrictMode>` (see `main.tsx`).
    StrictMode's dev double-invoke mounts/disposes the Fabric canvas twice and
    corrupts it (edits silently dropped on export). Production React never
    double-invokes, so this was dev-only, but StrictMode is removed so dev==prod.
  - W/H edits scale by desired/current *scaled* size (stroke-inclusive), not
    `W/width`, so they're exact.
  - Verified in-browser: SVG load, anchor render, add-shape, contextual props,
    exact W/H edit, anchor-field sync, live 1× preview (no anchor marker), and
    the full save round-trip (persisted SVG contains editor-added shapes).
    Lighter-verified (implemented, not click-simulated): canvas click-to-select,
    z-cycle, anchor drag, import-shape, color edits.

## Key decisions

- **Asset path lives OUTSIDE `/plugins`.** The server gates all `/plugins/*`
  behind *admin* auth and ignores `allow_readonly`, so a `/plugins/...svg` asset
  would not be loadable by read-only consumers. Assets are served at
  `/signalk/symbol-manager/symbols/:ref.svg` (registered on the app, like
  chart-tile plugins) and that is the `url` in every resource. This is a
  deliberate divergence from the literal route in `REQUIREMENTS.md`; the user
  approved it.
- **Auth is handled by the server, not the plugin.** The manager API under
  `/plugins/signalk-symbol-manager/api` is admin-gated by the server's global
  `/plugins` middleware, so the plugin adds no auth of its own. Provider
  `setResource`/`deleteResource` always reject (read-only).
- **Scope was phased** (user choice): core first, editor second.
- **SVG sanitizer is jsdom-free.** Uses `@xmldom/xmldom` (pure JS) with a strict
  element allowlist + attribute scrubbing (`src/sanitize.ts`), NOT DOMPurify.
  Reason: DOMPurify needs jsdom, which leaks at the native/realm level
  (~17–35 KB per `sanitize` call, unfixable by `window.close()`/recycling) and
  is heavy for a Pi. The xmldom allowlist is leak-free (0.6 MB heap growth over
  5000 calls vs 191 MB) and ~75 MB lighter RSS. We own the sanitizer's security
  correctness; `test/sanitize.test.js` covers the vectors (script, foreignObject,
  on*, external href/url, javascript:, `<style>` CSS, `<!ENTITY>`/XXE, size).

## Known environment issue (NOT the plugin)

- The local `bin/n2k-from-file` SK server OOMs/aborts (`Abort trap: 6`, heap to
  ~4 GB) after being left running ~10–15 min, even idle. The user confirmed this
  predates the plugin (seen the same morning before any plugin code existed). It
  is a server/environment issue; the plugin handled only a handful of requests
  before the crash and is not the cause. Don't chase it as a plugin bug.

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
  `signalk-server-node`.

## Tests

- `npm test` builds the backend and runs `node:test` suites in `test/`
  (symbolKey, sanitize, service) — 23 tests.
