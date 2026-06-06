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
- Serve the manager at `/<package-name>/` from `public/`, and plugin APIs under `/plugins/signalk-symbol-manager/...` via `registerWithRouter()`.
- Store metadata in SQLite and sanitized SVG files under `app.getDataDirPath()`.
- Provide routes:
  - `GET /plugins/signalk-symbol-manager/api/symbols`
  - `GET /plugins/signalk-symbol-manager/api/symbols/:id`
  - `POST /plugins/signalk-symbol-manager/api/symbols`
  - `PUT /plugins/signalk-symbol-manager/api/symbols/:id`
  - `DELETE /plugins/signalk-symbol-manager/api/symbols/:id`
  - `GET /plugins/signalk-symbol-manager/symbols/:id.svg`
- Sanitize SVG server-side with an SVG allowlist, remove scripts/event handlers/`foreignObject`/external references, enforce size limits, and serve `image/svg+xml`.

## Runtime Contract

The plugin must register as a Signal K `symbols` resource provider using:

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

`getResource`, `setResource`, and `deleteResource` must accept the canonical
resource id. For this plugin that means ids such as:

```text
signalk-symbol-manager:dive-site
```

The plugin may internally parse that value into source and local id. Asset routes
may use local ids as long as the public resource API remains canonical.

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

The object key must match:

```text
${$source}:${id}
```

## Data Storage

The plugin may use Node.js 22.5+ integrated SQLite support for metadata and
symbol storage.

Runtime data must live in the Signal K plugin data directory. Do not commit user
symbols, uploaded files, generated thumbnails, or SQLite databases to git.

The datastore should support:

- stable symbol ids
- display names and descriptions
- SVG content or SVG file references
- role/tag metadata
- scale and anchor metadata
- created/updated timestamps

The datastore does not need to support arbitrary source values. All symbols
managed by this plugin use the plugin id as `$source`.

## Web App

The plugin must provide a Signal K web app for end users.

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

The template should also pre-populate the "roles" and "tags" structure with
defaults specified in the template definition `.json` file.

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
map point = pixel anchor after scale is applied
```

### Direct upload

The SVG Editor may not be sophisticated enough to render complex SVG. The
CRUD list should support a direct upload (with sanitation step) to add
a symbol directly to the list, bypassing the editor. This allows more
complex symbols that would break in the editor to be added to the symbol
library.


### SVG Editor View

The editor view should support:

#### Preview Panel
A preview panel to view the symbol at the size it is expected to render in Freeboard-SK using the symbol's configured `scale` and source SVG dimensions

#### Properties Panel
A "Properties" panel where the user can edit:

- Symbol wide properties (when an individual shape is NOT selected)
  * id, name, description
  * roles and tags
     * should be assisgned via a set of one or more checkboxes of
       fixed value (see full spec). A checkbox with "custom" and a text input 
       for free form text
  * editing map-marker metadata such as anchor point and scale
 
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

Planned routes:

```text
/plugins/signalk-symbol-manager/
/plugins/signalk-symbol-manager/symbols/:id.svg
/plugins/signalk-symbol-manager/api/symbols
/plugins/signalk-symbol-manager/api/symbols/:id
```

The public resource-provider surface remains:

```text
/signalk/v2/api/resources/symbols
/signalk/v2/api/resources/symbols/:resourceId
```

The plugin API routes are for the manager web app. Consumers should prefer the
Signal K resources API for discovery.

## Authorization

Read access to symbol resources can be public if the Signal K server permits
read-only resource access.

Create, update, upload, and delete operations must require appropriate Signal K
write/admin authorization. Do not allow unauthenticated symbol library mutation.

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
- SVG assets are served with the correct content type.
- unsafe SVG upload attempts are rejected or sanitized.
- create/edit/delete operations require authorization.
- a symbol-aware consumer app can discover and render a managed symbol.

## Test Plan

- Unit tests for id parsing, canonical key generation, SQLite metadata operations, SVG file writes, and sanitizer rejects.
- Integration tests against a local Signal K server:
  - provider registration appears under `/resources/symbols/_providers`
  - `GET /signalk/v2/api/resources/symbols` returns canonical keys
  - `GET /signalk/v2/api/resources/symbols/:resourceId` returns one symbol
  - SVG route returns `Content-Type: image/svg+xml`
  - create/update/delete require authorization
- UI tests for create, edit, duplicate, upload, delete, role/tag editing, anchor/scale editing, and Fabric.js export.

## Assumptions And Defaults

- Node requirement for the plugin is `>=22.5.0` because it uses `node:sqlite`.
- The first version supports SVG only; no PNG sprite generation, MapLibre sprite metadata, or S-57/ENC portrayal changes.
- Fabric.js visual editing may normalize complex uploaded SVGs. The plugin must preserve a source/upload path so users are not blocked when Fabric cannot round-trip an SVG cleanly.
