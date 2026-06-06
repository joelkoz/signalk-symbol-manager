# Signal K Symbol Manager

Signal K server plugin and Signal K Plugin WebApp for managing a custom
library of SVG symbols.

The plugin exposes those symbols through the Signal K resources API as:

```text
/signalk/v2/api/resources/symbols
```

For the first MVP, this resources API surface is read-only. Symbol-aware
applications can discover and read symbols there for note icons, waypoint icons,
map markers, buttons, logs, alerts, or other UI features. Symbol creation,
upload, editing, and deletion are handled by the Symbol Manager web UI and its
plugin API routes under `/plugins/signalk-symbol-manager/...`.

## Requirements

This plugin requires:

- Signal K Server with Resource Provider plugin support.
- Node.js 22.5 or newer.
- A symbol-resource-aware consumer app.

Node.js 22.5+ is required because the plugin uses Node's integrated
`node:sqlite` support for user-managed symbol metadata.

The package is both a normal Signal K server plugin and a Signal K WebApp. Its
`package.json` must include both `signalk-node-server-plugin` and
`signalk-webapp` keywords. Signal K Server serves the compiled UI from
`public/` at:

```text
/signalk-symbol-manager/
```

Plugin API and symbol asset routes live under:

```text
/plugins/signalk-symbol-manager/...
```

For Freeboard-SK, symbol resources will require the forthcoming Freeboard-SK
symbol-resource consumer PR to be merged and released. Until that Freeboard-SK
PR is available in your installed Freeboard version, the symbols can be managed
by this plugin but will not appear in Freeboard's icon selectors or map markers.

A Signal K server upgrade is not expected solely to install this plugin on
servers that already include Resource Provider support. The Signal K resources
API supports custom/user-defined resource provider types, and `symbols` can be
registered through that existing mechanism.

## Planned Features

- Create custom SVG symbols.
- Edit symbols in an integrated lightweight Fabric.js editor.
- Upload existing SVG files.
- Rename, duplicate, delete, and organize symbols.
- Preview symbols at common map-marker and UI sizes.
- Start new symbols from templates, including:
  - a Map note template matching Freeboard-SK's default note marker shape
  - an empty canvas
- Serve symbols through the Signal K Resource Provider API as a read-only
  discovery surface.

## Development

Install dependencies, build the web app, and run backend tests:

```sh
npm install
npm run build
npm test
```

For local Signal K development, link the plugin into `~/.signalk`:

```sh
npm link
cd ~/.signalk
npm link signalk-symbol-manager
```

Restart the Signal K server after installing or linking the package, then enable
the plugin in the Signal K plugin manager. The manager is a Signal K Plugin
WebApp and appears in the server Webapps menu as `Symbol Manager` after the
plugin is enabled. You can also open it directly:

```text
http://localhost:3000/signalk-symbol-manager/
```

## Symbol Names

Symbols use a source-qualified id:

```text
<$source>:<id>
```

This plugin's `$source` value is:

```text
signalk-symbol-manager
```

`$source` is not a user-facing setting. It is the plugin id so that symbols from
different providers do not collide.

For example:

```text
signalk-symbol-manager:dive-site
```

Consumer applications may also support unqualified names such as:

```text
dive-site
```

When a symbol name is unqualified, the consumer decides the search order. A
qualified name is preferred when you want to guarantee that a specific provider's
symbol is used.

## SVG Safety

Uploaded SVG files will be treated as untrusted user input. The plugin should
sanitize uploaded SVG before storing or serving it, removing scripts, event
handlers, unsafe external references, and unsupported embedded content.

## Chart Symbols

This plugin is intended for application symbols and map overlay markers.

Native S-57/ENC chart portrayal uses a chart-symbol catalog and renderer-specific
lookup rules. That is different from ordinary SVG note or waypoint symbols and
is not part of the first version of this plugin.
