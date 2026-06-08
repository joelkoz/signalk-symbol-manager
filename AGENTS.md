# Agent Instructions

Before changing or debugging this repository, read:

1. `README.md` — end-user documentation. Read it to understand the user-facing
   feature set, terminology, and the namespace-override mechanism. **Do not**
   add developer-only material (build commands, HTTP routes, sanitizer
   internals, etc.) to this file — that content lives here and in
   `REQUIREMENTS.md`.
2. `REQUIREMENTS.md` — the authoritative implementation spec: HTTP routes,
   resource shape, namespace rules, SVG sanitization, data storage layout,
   verification and test plan.
3. `MEMORY.md`, if present.

Symbol Manager implementation work is standalone. Use a
`symbol-resource-provider` branch in this repository only. Do not create
branches, edit files, or commit changes in `../signalk-server-node` or
`../freeboard-sk` while working on this plugin.

## Repository layout

```
src/        TypeScript backend source (plugin entry, store, service, routes,
            sanitizer, types). Compiled to plugin/ via the build script.
plugin/     Compiled JavaScript that signalk-server actually runs.
            Generated — do not hand-edit.
web/        Vite + React + Fabric.js editor source. Compiled to public/.
public/     The Signal K WebApp bundle that the server serves at
            /signalk-symbol-manager/. Generated — do not hand-edit.
templates/  Starter-template catalog (templates.json + svg/*.svg).
            Loaded by the backend at request time; no rebuild required.
test/       Node test runner suites for the backend (sanitizer, key
            validation, service round-trips, store).
```

## Build / test / run

```sh
npm install            # install all deps (backend + web)
npm run build          # tsc backend → plugin/, vite build web → public/
npm run build:web      # web only (vite build)
npm test               # backend unit tests (node --test)
```

For interactive editor work, run the Vite dev server (with proxy to a local
Signal K server on :3000):

```sh
npm run dev -- --port 5180 --strictPort
```

The web app uses the Signal K admin cookie for `/plugins/...` and
`/signalk/...` calls, so the dev page must be loaded after logging in to
`http://localhost:3000/admin/`.

**Do not wrap the web app in `<React.StrictMode>`.** StrictMode's
development double-invocation mounts and disposes the Fabric.js canvas
twice, corrupting the imperatively-managed editor. The omission is
deliberate and is noted in `REQUIREMENTS.md`.

## Local Signal K dev server

This workspace runs Signal K via `signalk-server-node/bin/n2k-from-file`.

**Known issue — mDNS cache exhaustion** ([SignalK/signalk-server#2761](https://github.com/SignalK/signalk-server/issues/2761)):
`@astronautlabs/mdns` (introduced upstream in PR #2601) caches every mDNS
record from the wire with no size cap. On a home LAN with many Apple devices
this causes OOM/`Abort trap: 6` in ~10–15 minutes. This is **not a plugin
bug**.

**Workaround:** `"mdns": false` is already set in
`signalk-server-node/settings/n2k-from-file-settings.json`, which disables
the mDNS subsystem for local dev. Do not remove that setting until
[issue #2761](https://github.com/SignalK/signalk-server/issues/2761) is
resolved upstream.

**Do not** edit `signalk-server-node` beyond the settings file — the
workspace rule forbids unrelated changes outside this plugin.

The plugin must remain a normal Signal K server plugin and Signal K Plugin
WebApp. It should not require a custom Signal K server build for end users. The
Resource Provider API already supports custom resource types, and this plugin
should register as a provider for `symbols`.

For the first MVP, the Resource Provider surface is read-only. Implement all four
Resource Provider methods because Signal K requires them, but only
`listResources` and `getResource` should return symbol data. `setResource` and
`deleteResource` must reject without mutating data. Symbol creation, upload,
editing, and deletion must go through the Symbol Manager plugin API and web UI.
All managed symbols use `namespace: user` by default. `$source` remains Signal K
resource response metadata for the provider plugin and is not the symbol
namespace.

The manager UI must be packaged as a Signal K WebApp: put the compiled UI in
`public/`, include the `signalk-webapp` package keyword, and let Signal K Server
serve it at `/signalk-symbol-manager/`. Do not serve the UI from
`registerWithRouter()`; use that only for plugin API and asset routes under
`/plugins/signalk-symbol-manager/...`.

Keep user-created symbol data out of git. Runtime data should live in the
Signal K plugin data directory. Use Node's integrated `node:sqlite` support for
user-managed symbol metadata. Store sanitized SVG assets in the plugin data
directory and index them from SQLite; do not commit uploaded SVG files,
generated thumbnails, or SQLite databases to git.

The generic symbol resource contract keeps `scale` and `anchor` optional for
other providers, but this reference plugin must implement recommended map-marker
metadata. Every managed symbol with `note`, `waypoint`, or `map-marker` role must
persist and emit `scale` and `anchor`. Templates must provide defaults, and
direct SVG upload must require the user to confirm or edit those values before
the symbol is offered for map-marker use.

Use separate UI controls for roles and tags. Roles are controlled advisory
values and should be edited with checkboxes. Tags are free-form search/filter
metadata and should be edited with a maintained React tag-input component found
during implementation, not a hand-rolled tag editor.

Preserve the namespace-qualified symbol reference contract:

```text
<namespace>:<id>
```

The plugin's default symbol namespace is:

```text
user
```

`namespace` is symbol metadata used by consumers for symbol lookup and collision
resolution. It must match `[A-Za-z0-9_]+`. `$source` is separate Signal K
`Resource<T>` metadata and remains the provider plugin id.

Do not implement native S-57/ENC portrayal changes in this plugin. S-57/ENC
chart-symbol catalog support is a separate chart portrayal problem, not part of
the first symbol manager implementation.
