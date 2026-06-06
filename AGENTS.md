# Agent Instructions

Before changing or debugging this repository, read:

1. `README.md`
2. `REQUIREMENTS.md`
3. `MEMORY.md`, if present

This project currently contains implementation-spec documents only. Do not add
implementation code until the user explicitly starts the implementation phase.

The plugin must remain a normal Signal K server plugin and Signal K Plugin
WebApp. It should not require a custom Signal K server build for end users. The
Resource Provider API already supports custom resource types, and this plugin
should register as a provider for `symbols`.

For the first MVP, the Resource Provider surface is read-only. Implement all four
Resource Provider methods because Signal K requires them, but only
`listResources` and `getResource` should return symbol data. `setResource` and
`deleteResource` must reject without mutating data. Symbol creation, upload,
editing, and deletion must go through the Symbol Manager plugin API and web UI.
All managed symbols use `$source: signalk-symbol-manager`.

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

Preserve the source-qualified id contract:

```text
<$source>:<id>
```

The plugin's `$source` value is:

```text
signalk-symbol-manager
```

`$source` is not user configurable. It is the Signal K plugin/provider id and
is used for internal conflict resolution.

Do not implement native S-57/ENC portrayal changes in this plugin. S-57/ENC
chart-symbol catalog support is a separate chart portrayal problem, not part of
the first symbol manager implementation.
