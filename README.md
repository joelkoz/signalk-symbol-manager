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

- Node.js 22.5 or newer.
- A "symbol resource aware" consumer app.

### Symbol Aware Apps
Freeboard-SK is the reference application that consumes symbols created in this library. A forthcoming Freeboard-SK
symbol-resource consumer PR will soon be merged and released. Until that Freeboard-SK
PR is available in your installed Freeboard version, the symbols can be managed
by this plugin but will not appear in Freeboard's icon selectors or map markers.


## Features

- Create custom SVG symbols.
- Edit symbols in an integrated lightweight Fabric.js editor.
- Upload existing SVG files.
- Rename, duplicate, delete, and organize symbols.
- Preview symbols at common map-marker and UI sizes.
- Persist scale and anchor metadata for symbols intended for Freeboard-SK map
  marker use.
- Edit roles with checkboxes and tags with a dedicated React tag editor.
- Start new symbols from templates, including:
  - a POI template matching Freeboard-SK's default note marker shape
  - a flag template
  - a waypoint template
  - a blank canvas
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

Symbols use a namespace-qualified reference:

```text
<namespace>:<id>
```

This plugin's default namespace for user-managed symbols is:

```text
user
```

`namespace` is symbol metadata used by consumers to look up symbols and resolve
name collisions. It must match `[A-Za-z0-9_]+`.

For example:

```text
user:dive-site
```

Consumer applications may also support unqualified names such as:

```text
dive-site
```

When a symbol name is unqualified, the consumer decides the search order. A
qualified name is preferred when you want to guarantee that a specific namespace
is used.

The Symbol Manager resource provider keys symbols by the qualified
`namespace:id` form. If it receives an unqualified local id such as `dive-site`,
it returns a symbol only when exactly one managed symbol has that local id. If
multiple namespaces contain the same local id, the lookup is ambiguous.

## SVG Safety

Uploaded SVG files will be treated as untrusted user input. The plugin should
sanitize uploaded SVG before storing or serving it, removing scripts, event
handlers, unsafe external references, and unsupported embedded content.

## Chart Symbols

This plugin is intended for application symbols and map overlay markers.

Native S-57/ENC chart portrayal uses a chart-symbol catalog and renderer-specific
lookup rules. That is different from ordinary SVG note or waypoint symbols and
is not part of the first version of this plugin.
