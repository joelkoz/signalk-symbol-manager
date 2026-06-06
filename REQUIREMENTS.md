# Requirements: Signal K Symbol Manager

This document is for AI agents implementing or reviewing this plugin.

## Purpose

This plugin provides a user-managed SVG symbol library and exposes it as a
Signal K resource provider under:

```text
symbols
```

The plugin is both:

- a useful end-user app for creating and managing custom symbols
- a reference implementation for the generic Signal K symbol resource
  contract
- NOT tied directly to the Signal K `Freeboard SK` webapp, though Freeboard
will be the reference consumer app

The authoritative implementation spec is:

```text
../freeboard-extension-spec/rfc-symbol-resource-provider.md
```

Execution should first create `symbol-resource-provider` branch in the git project.

The plugin UI will use React + Fabric.js. Keep upload/source editing as fallback for complex SVGs. 

## Additional References

- [Fabric.js](https://github.com/fabricjs/fabric.js/)


## Stand alone source
Code should stand alone and NOT touch any source code outside of this
plugin project directory. Do NOT modify any Signal K server or Freeboard SK
code unless instructed by the user.


## General Implementation plan

- Scaffold as a normal Signal K plugin and webapp with `signalk-node-server-plugin` and `signalk-webapp` metadata.
- Use `app.registerResourceProvider({ type: 'symbols', methods })` with all four methods.
- Implement the manager UI as a Signal K Plugin WebApp, not as a generic
  Express-served web app. The package must include both package keywords:
  `signalk-node-server-plugin` and `signalk-webapp`.
- Put the built manager UI under `public/`. Signal K Server mounts
  `public/` automatically at:

  ```text
  /signalk-symbol-manager/
  ```

- Do not mount the manager UI with `registerWithRouter()`.
- Use `registerWithRouter()` only for plugin-owned API and asset routes under
  `/plugins/signalk-symbol-manager/...`.
- Store user-managed symbol metadata in Node's integrated SQLite database under
  `app.getDataDirPath()`, and store sanitized SVG asset files under the same
  plugin data directory.
- Provide routes:
  - `GET /plugins/signalk-symbol-manager/api/symbols`
  - `GET /plugins/signalk-symbol-manager/api/symbols/:id`
  - `POST /plugins/signalk-symbol-manager/api/symbols`
  - `PUT /plugins/signalk-symbol-manager/api/symbols/:id`
  - `DELETE /plugins/signalk-symbol-manager/api/symbols/:id`
  - `GET /plugins/signalk-symbol-manager/symbols/:id.svg`
- Sanitize SVG server-side with an SVG allowlist, remove scripts/event handlers/`foreignObject`/external references, enforce size limits, and serve `image/svg+xml`.

## Runtime Contract

The plugin must register as a read-only Signal K `symbols` resource provider
using:

```js
app.registerResourceProvider({ type: 'symbols', methods: ... })
```

The provider must implement all four provider methods:

```text
listResources
getResource
setResource
deleteResource
```

Signal K requires all four methods for provider registration, but the first MVP
must treat the resource-provider surface as read-only:

- `listResources` must return the managed symbol collection.
- `getResource` must return one managed symbol by canonical resource id.
- `setResource` must reject and must not mutate the symbol library.
- `deleteResource` must reject and must not mutate the symbol library.

Symbol creation, upload, editing, and deletion must be implemented through the
Symbol Manager plugin API and web UI, not through the public resources API.

The resource collection returned by `listResources` must be keyed by canonical
symbol reference:

```text
<$source>:<id>
```

For this plugin, the `$source` value is:

```text
signalk-symbol-manager
```

`$source` must be the Signal K plugin/provider id. It is not user configurable
and must not be exposed as a normal end-user setting.

Example resource key:

```text
signalk-symbol-manager:dive-site
```

`getResource` must accept the canonical resource id. For this plugin that means
ids such as:

```text
signalk-symbol-manager:dive-site
```

The plugin may internally parse that value into source and local id. Asset routes
may use local ids as long as the public resource API remains canonical.

All symbols managed by the first MVP originate from this plugin. The provider
must not accept writes for other `$source` values and must not act as a generic
multi-provider symbol store.

## Symbol Resource Shape

Each symbol resource returned by the provider must include:

```json
{
  "id": "dive-site",
  "$source": "signalk-symbol-manager",
  "timestamp": "2026-06-05T12:30:00.000Z",
  "name": "Dive Site",
  "mediaType": "image/svg+xml",
  "url": "/plugins/signalk-symbol-manager/symbols/dive-site.svg"
}
```

Create/update payloads do not need to include `$source` or `timestamp`. The
plugin derives `$source` from its provider id and assigns `timestamp` as resource
response metadata.

Recommended fields:

- `description`
- `roles`
- `tags`
- `scale`
- `anchor`

Roles and tags have different semantics:

- `roles` are controlled advisory usage categories. The UI must present the
  known role vocabulary as checkboxes.
- `tags` are free-form search/filter labels. The UI must use a maintained React
  tag-input/tag-editor component for adding, removing, and editing tags.

For the generic Signal K symbol resource contract, `scale` and `anchor` are
optional. For this reference plugin, they are required for every managed symbol
that is intended for map-marker use. A symbol is map-marker-capable when its
`roles` include any of:

```text
note
waypoint
map-marker
```

For those symbols, the provider must persist and emit both `scale` and `anchor`.
Symbols without map-marker roles may omit them.

The object key must match:

```text
${$source}:${id}
```

## Data Storage

The plugin must use Node.js 22.5+ integrated `node:sqlite` support for
user-managed symbol metadata persistence.

Runtime data must live in the Signal K plugin data directory. Do not commit user
symbols, uploaded files, generated thumbnails, or SQLite databases to git.

The SQLite datastore must support:

- stable symbol ids
- display names and descriptions
- sanitized SVG file references
- role/tag metadata
- scale and anchor metadata
- created/updated timestamps

Sanitized SVG assets should be stored as files under the plugin data directory,
not in the source tree. SQLite should store metadata and asset file references;
it should not be treated as a general multi-provider symbol store.

The datastore must not support arbitrary source values. All symbols
managed by this plugin use the plugin id as `$source`.

## Web App

The plugin must provide a Signal K Plugin WebApp for end users.

This is a normal Signal K WebApp shipped by the plugin package:

- `package.json` must include the `signalk-webapp` keyword so Signal K Server
  discovers it as a webapp.
- The compiled UI must be in `public/`.
- Signal K Server serves that `public/` directory at `/<package-name>/`.
- For this package, the manager UI path is:

  ```text
  /signalk-symbol-manager/
  ```

- The Signal K Admin UI should list it on the Webapps page using the package
  metadata. The package should set `signalk.displayName` to `Symbol Manager`.
- The manager UI should call plugin API routes under
  `/plugins/signalk-symbol-manager/...` for CRUD, upload, and asset-management
  operations.
- `registerWithRouter()` must not serve the compiled UI. It is only for plugin
  API and asset routes.

The web app's main view should be CRUD list manager for a library of zero or more user-defined symbols. 

The list should have the following columns:

- the symbol itself (sized in the same display size in Freeboard)
- The symbol name
- The symbol description
- An actions column with icons for Edit and Delete

The list screen must support:

- loading and refreshing the current symbol library
- showing an empty state when no symbols exist
- creating a new symbol via a `New` action
- editing an existing symbol via an `Edit` action
- uploading an external SVG file
- duplicating a symbol
- deleting a symbol

The SVG editor must only appear after the user explicitly chooses `New` or
`Edit`.

### Symbol Templates

When `New` is selected, the user must first choose an initial template before
the editor appears. The initial template list should come from an extensable `.json` file in the source tree that defines the templates to choose from. The initial templates should be:

- `POI`
- `Flag`
- `Waypoint`
- `Blank`

The `POI` template should visually match the Freeboard-SK POI note marker
style, including its anchor point at the tip of the symbol in the lower left. The reference asset is:

```text
../freeboard-sk/src/assets/img/poi/dive-site.svg
```

That reference is a red note marker with a white stripe. The Symbol Manager
`POI` starter must use the same note-marker shape, but without the white
stripe, so the starter is a plain editable colored note marker. The editor must
provide a fill color picker that can change the note marker fill color.


The `Flag` template should be an asset that appears as a flag.
One possible reference asset is:

```text
../freeboard-extension-spec/map-flag-example.svg
```

A possible `Waypoint` reference asset is:

```text
../freeboard-extension-spec/waypoint-example.svg
```

The template should also pre-populate the `roles`, `tags`, `scale`, and `anchor`
structure with defaults specified in the template definition `.json` file.
Templates with `note`, `waypoint`, or `map-marker` roles must define `scale` and
`anchor`.

### Freboard Reference Information

FOR IMPLEMENTATION REFERENCE ONLY!

Freeboard POI icon definitions (i.e. POI) use:

```ts
scale: 0.65
anchor: [1, 37]
```

Freeboard-SK currently registers POI note icons in:

```text
../freeboard-sk/src/app/modules/icons/poi.ts
```

Freeboard-SK builds map image styles in:

```text
../freeboard-sk/src/app/modules/map/ol/lib/map-image-registry.service.ts
```

The registry creates an OpenLayers `Icon` with the icon path as `src`, applies
the configured `scale` and `anchor`, and sets `anchorXUnits` and `anchorYUnits`
to `pixels`. Symbol Manager previews for Freeboard-SK map note usage must
therefore render the symbol as:

```text
displayed width = source SVG width * scale
displayed height = source SVG height * scale
map point = source pixel anchor, displayed at anchor * scale from the rendered top-left
```

Freeboard-SK can technically render an icon without explicit `scale` and
`anchor` because OpenLayers supplies defaults, but those defaults do not preserve
Freeboard's expected marker size or point placement. The Symbol Manager must
therefore treat `scale` and `anchor` as required metadata for symbols that can be
used as notes, waypoints, or other map markers.

### Direct upload

The SVG Editor may not be sophisticated enough to render complex SVG. The
CRUD list should support a direct upload (with sanitation step) to add
a symbol directly to the list, bypassing the editor. This allows more
complex symbols that would break in the editor to be added to the symbol
library.

Direct upload must still collect or confirm map-marker metadata. If the uploaded
symbol is assigned `note`, `waypoint`, or `map-marker` role, the save flow must
require valid `scale` and `anchor` values before the symbol is exposed through
the resource provider.


### SVG Editor View

The editor view should support:

#### Preview Panel
A preview panel to view the symbol at the size it is expected to render in Freeboard-SK using the symbol's configured `scale` and source SVG dimensions

#### Properties Panel
A "Properties" panel where the user can edit:

- Symbol wide properties (when an individual shape is NOT selected)
  * id, name, description
  * roles
     * assigned with checkboxes for the known role vocabulary
     * role checkboxes must include `note`, `waypoint`, `region`, `button`,
       `alert`, `logbook`, `map-marker`, and `vector-style-icon`
  * tags
     * assigned with a dedicated React tag-input/tag-editor component
     * support adding tags with keyboard delimiters, removing tags, preventing
       duplicates, and preserving tag order as entered
  * editing map-marker metadata: `scale` and `anchor`
 
- Shape/Text specific properties (when an individual shape or text is selected)

  - Shape type (line, circle, rectangle, arrow, text)
  - Text content (if a Text shape)
  - X, Y, W, H
  - Change color:
     - outline
     - foreground
     - fill
  - "Import shape" to add additional external SVG to the current image

#### Special handling of "POI" template

When editing POI symbols (i.e. the POI template was selected), the "import shape" should offer the option to
size and position the imported SVG in to the "square body" area of the
POI.  The "dive flag" reference POI shape has a white diagonal
line thru it. The ends of that line represents the corners of the bounding
box of the "body" area of a POI.

#### Shape selection

The editor should allow a specific shape to be selected by clicking on it.
Subsequent clicks on the same general area will select the shape "underneath"
the currently selected shape in Z order. When the bottom of the Z order
is reached, the "top" shape is selected again.

#### Other useful editing capabilities:

- view/edit raw SVG source
- zoom editor area
- resize/scale the entire symbol
- save back to the symbol library
- "Anchor point" should be visually represented on the editing screen,
  allowing a user to move a small icon to
  the point that is the anchor point. Moving this icon around the image
  will automatically update the "anchor point" metadata. This visual
  representation is "editor only" and should not be made part of the
  SVG source. A suggested reference image for this is `../freeboard-extension-spec/boat-anchor-example.svg`
  
  
## Software stack

The plugin UI will use React + Fabric.js. Fabric.js is the better fit for lightweight map-symbol creation than SVG-Edit because we can expose only the small tool surface needed for icons. Keep upload/source editing as fallback for complex SVGs.

For tag editing, use an existing maintained React tag-input component rather
than building a custom tag editor. During implementation, check current package
health and choose a component that supports TypeScript or clean TypeScript
wrapping, keyboard entry, tag removal, uniqueness, and accessible labels. Current
candidates to evaluate include `react-tag-input-component`, `react-tag-input`,
and `react-tag-autocomplete`.

For complex features, a web search of external open source libraries should
be checked and used before writing new code (e.g. [DOMPurify](https://github.com/cure53/dompurify) as a candidate for SVG sanitation)

## SVG Validation and Sanitization

Uploaded or edited SVG must be treated as untrusted.

The plugin should reject or remove:

- `<script>`
- event-handler attributes such as `onclick`
- `foreignObject`
- external network references
- unsafe embedded content
- files above the configured size limit

The plugin should serve SVG with:

```text
Content-Type: image/svg+xml
```

## HTTP Routes

Signal K WebApp UI route:

```text
/signalk-symbol-manager/
```

This route is not registered manually by the plugin. Signal K Server creates it
because the package has the `signalk-webapp` keyword and a `public/` directory.

Plugin API and asset routes registered with `registerWithRouter()`:

```text
/plugins/signalk-symbol-manager/symbols/:id.svg
/plugins/signalk-symbol-manager/api/symbols
/plugins/signalk-symbol-manager/api/symbols/:id
```

The public resource-provider surface remains:

```text
GET /signalk/v2/api/resources/symbols
GET /signalk/v2/api/resources/symbols/:resourceId
```

For this plugin, `POST`, `PUT`, and `DELETE` against
`/signalk/v2/api/resources/symbols` are not supported mutation paths and must
not change the symbol library. The provider's write methods should reject with a
clear read-only/not-supported error.

The plugin API routes are for the manager web app. Consumers should prefer the
Signal K resources API for discovery. The route
`/plugins/signalk-symbol-manager/` must not be treated as the manager UI root.

## Authorization

Read access to symbol resources can be public if the Signal K server permits
read-only resource access.

Create, update, upload, and delete operations through the plugin API must require
appropriate Signal K write/admin authorization. Do not allow unauthenticated
symbol library mutation.

Resource-provider `setResource` and `deleteResource` calls must remain read-only
rejections even for authenticated users. Authentication can authorize the plugin
manager API, but it must not turn the resources API into a second mutation path
for this MVP.

## Chart and Vector Renderer Notes

This plugin's first MVP targets SVG symbols for UI and map overlay markers.

MVT, Mapbox/MapLibre style sprites, and S-57/ENC native chart portrayal are
renderer-specific. The plugin may eventually generate renderer-specific assets,
but the first version must not claim to replace S-57/ENC chart-symbol catalogs.

Native S-57/ENC custom portrayal belongs in a separate map-style or
chart-portrayal implementation spec.

## Non-Goals

- Do not require a custom Signal K server build.
- Do not implement consumer application changes in this plugin.
- Do not implement native S-57/ENC portrayal in the first version.
- Do not store user-generated runtime data in git.
- Do not require consumers to support every optional symbol asset format.

## Verification Goals

When implementation begins, verification should include:

- `GET /signalk/v2/api/resources/symbols` returns canonical symbol keys.
- `GET /signalk/v2/api/resources/symbols/:resourceId` returns the requested symbol.
- `POST`, `PUT`, and `DELETE` through `/signalk/v2/api/resources/symbols` reject
  without mutating the symbol library.
- SVG assets are served with the correct content type.
- unsafe SVG upload attempts are rejected or sanitized.
- plugin API create/edit/delete operations require authorization.
- a symbol-aware consumer app can discover and render a managed symbol.

## Test Plan

- Unit tests for id parsing, canonical key generation, SQLite metadata operations, SVG file writes, and sanitizer rejects.
- Integration tests against a local Signal K server:
  - provider registration appears under `/resources/symbols/_providers`
  - `GET /signalk/v2/api/resources/symbols` returns canonical keys
  - `GET /signalk/v2/api/resources/symbols/:resourceId` returns one symbol
  - resource-provider `POST`, `PUT`, and `DELETE` reject without mutating data
  - SVG route returns `Content-Type: image/svg+xml`
  - plugin API create/update/delete require authorization
- UI tests for create, edit, duplicate, upload, delete, role/tag editing, anchor/scale editing, and Fabric.js export.

## Assumptions And Defaults

- Node requirement for the plugin is `>=22.5.0` because it uses `node:sqlite`.
- The first version supports SVG only; no PNG sprite generation, MapLibre sprite metadata, or S-57/ENC portrayal changes.
- Fabric.js visual editing may normalize complex uploaded SVGs. The plugin must preserve a source/upload path so users are not blocked when Fabric cannot round-trip an SVG cleanly.
