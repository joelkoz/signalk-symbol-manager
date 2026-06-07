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

## HTTP Endpoints

Discovery / read (public, subject to the server's read-only access policy):

```text
GET /signalk/v2/api/resources/symbols            # collection keyed by namespace:id
GET /signalk/v2/api/resources/symbols/:resourceId # one symbol (namespace:id or unique local id)
```

Symbol SVG asset (public):

```text
GET /signalk/symbol-manager/symbols/:ref.svg     # served as image/svg+xml
```

> **Note on the asset path.** Each resource's `url` points at
> `/signalk/symbol-manager/symbols/...`, served outside `/plugins`. The Signal K
> server gates every `/plugins/*` route behind *admin* authentication (it does
> not honor `allow_readonly` there), so an asset under `/plugins` would not be
> loadable by read-only consumers. Serving the SVG on a public `/signalk` path —
> the same approach used by chart-tile plugins — keeps symbols discoverable and
> renderable for any consumer when the server allows read-only access.

Manager CRUD API (under `/plugins/...`, which the server protects with admin
authentication; mutations therefore require an authenticated administrator):

```text
GET    /plugins/signalk-symbol-manager/api/symbols
GET    /plugins/signalk-symbol-manager/api/symbols/:ref
POST   /plugins/signalk-symbol-manager/api/symbols
PUT    /plugins/signalk-symbol-manager/api/symbols/:ref
POST   /plugins/signalk-symbol-manager/api/symbols/:ref/duplicate
DELETE /plugins/signalk-symbol-manager/api/symbols/:ref
GET    /plugins/signalk-symbol-manager/api/templates
POST   /plugins/signalk-symbol-manager/api/sanitize
```

`POST` / `PUT` / `DELETE` against `/signalk/v2/api/resources/symbols` are
rejected without mutating the library: the resource provider is read-only.

## SVG Safety

Uploaded SVG files are treated as untrusted user input. The plugin sanitizes SVG
before storing or serving it using a strict allowlist over a pure-JS DOM
(`@xmldom/xmldom`, no jsdom): only allowlisted SVG elements are kept, and
scripts, event-handler attributes, `<foreignObject>`, external references,
`javascript:`/CSS `expression()`, unsafe `<style>` CSS, and internal entity
definitions (XXE guard) are removed, with a configurable size limit. Assets are
served with `Content-Type: image/svg+xml`.

## Chart Symbols

This plugin is intended for application symbols and map overlay markers.

Native S-57/ENC chart portrayal uses a chart-symbol catalog and renderer-specific
lookup rules. That is different from ordinary SVG note or waypoint symbols and
is not part of the first version of this plugin.
