# Requirements: Signal K Symbol Manager

This document is for AI agents implementing or reviewing this plugin.

## Purpose

This plugin provides a user-managed SVG symbol library and exposes it as a
Signal K resource provider under the `symbols` resource type. It is both:

- a useful end-user app for creating and managing custom symbols, and
- the reference implementation for the `symbols` Signal K resource contract.

The `symbols` resource type and API contract are documented in
**[`symbols-api.md`](symbols-api.md)** in this repository. That document is
the community-facing spec intended for submission to the Signal K server
documentation (as a proposed resource API). Agents implementing or reviewing
this plugin should read `symbols-api.md` first to understand the resource
shape, identity rules, symbol resolution, and provider/consumer requirements.
This document covers only the plugin-specific implementation details.

Symbol Manager implementation work is standalone. Do not create
branches, edit files, or commit changes in the repos `signalk-server` nor
`freeboard-sk`.

The plugin UI uses React + Fabric.js. Keep upload/source editing as fallback
for complex SVGs.

## Implementation Notes

> **Fabric.js gotcha — do not use `<React.StrictMode>`.**
> StrictMode's development double-invocation mounts and disposes the Fabric.js
> canvas twice, corrupting the imperatively-managed editor. The omission is
> deliberate. The Freeboard preview defaults to 1× magnification and does not
> draw the anchor marker (the draggable anchor lives on the editor canvas only).

## General requirements
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
- Use `registerWithRouter()` for the plugin-owned manager API under
  `/plugins/signalk-symbol-manager/api/...`. Register the public SVG asset route
  directly on the app (outside `/plugins`) so read-only consumers can load it —
  see *HTTP Routes* and *Authorization*.
- Store user-managed symbol metadata in Node's integrated SQLite database under
  `app.getDataDirPath()`, and store sanitized SVG asset files under the same
  plugin data directory.
- Provide routes:
  - `GET /plugins/signalk-symbol-manager/api/symbols`
  - `GET /plugins/signalk-symbol-manager/api/symbols/:id`
  - `POST /plugins/signalk-symbol-manager/api/symbols`
  - `PUT /plugins/signalk-symbol-manager/api/symbols/:id`
  - `DELETE /plugins/signalk-symbol-manager/api/symbols/:id`
  - `GET /signalk/symbol-manager/symbols/:id.svg` _(public asset route, registered on the app — not under `/plugins`)_
- Sanitize SVG server-side with an SVG allowlist (`@xmldom/xmldom`, jsdom-free), remove scripts/event handlers/`foreignObject`/external references, enforce size limits, and serve `image/svg+xml`.

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

Signal K requires all four methods for provider registration. The
resource-provider surface is read-only:

- `listResources` must return the managed symbol collection.
- `getResource` must return one managed symbol by resource id.
- `setResource` must reject and must not mutate the symbol library.
- `deleteResource` must reject and must not mutate the symbol library.

Symbol creation, upload, editing, and deletion must be implemented through the
Symbol Manager plugin API and web UI, not through the public resources API.

The resource collection returned by `listResources` must be keyed by canonical
namespace-qualified resource id:

```text
<namespace>:<id>
```

For this plugin, the default symbol namespace is:

```text
user
```

`namespace` is symbol metadata used by consumers for symbol lookup and collision
resolution. It is separate from Signal K `$source` response metadata.

Namespace rules:

- `namespace` is required.
- `namespace` must match `[A-Za-z0-9_-]+`.

The plugin may allow the user to choose a different namespace, but the default
for user-managed Symbol Manager symbols must be `user`.

Example resource key:

```text
user:dive-site
```

The resource key is also the consumer symbol reference.

`getResource` must accept the canonical namespace-qualified resource id. For
this plugin that means ids such as:

```text
user:dive-site
```

The plugin must also handle an unqualified local id request as a convenience
lookup:

```text
dive-site
```

An unqualified lookup must succeed only when exactly one symbol with that local
id exists in the Symbol Manager library. If more than one namespace contains the
same local id, the provider must reject the unqualified lookup as ambiguous.

Asset routes may use local ids only where the route can unambiguously identify
the symbol. Public resource API keys must use the canonical `namespace:id`
resource id.

All symbols originate from this plugin. The provider must not act as a
generic multi-provider symbol store. If two providers expose the same
`namespace:id` consumer reference, the winning symbol is undefined.

## Symbol Resource Shape

Each symbol resource returned by the provider must include:

```json
{
  "id": "dive-site",
  "namespace": "user",
  "$source": "signalk-symbol-manager",
  "timestamp": "2026-06-05T12:30:00.000Z",
  "name": "Dive Site",
  "mediaType": "image/svg+xml",
  "url": "/signalk/symbol-manager/symbols/dive-site.svg"
}
```

Create/update payloads do not need to include `$source` or `timestamp`. The
plugin derives `$source` from its provider id and assigns `timestamp` as resource
response metadata. `namespace` is provider-owned symbol payload metadata and
must be stored with the symbol.

Required symbol payload fields:

- `id`
- `namespace`
- `name`
- `mediaType`
- `url`

Recommended fields:

- `description`
- `roles`
- `tags`
- `scale`
- `anchor`
- `gpxType`
- `gpxSym`

`gpxType` and `gpxSym` are optional free-form strings that map the symbol to a
GPX waypoint's `<type>` and `<sym>` fields, so a symbol-aware consumer can
select this symbol on GPX import (or emit these values on GPX export). They are
emitted on the public resource shape only when non-empty.

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
resourceKey === `${namespace}:${id}`
```

## Data Storage

The plugin must use Node.js 22.5+ integrated `node:sqlite` support for
user-managed symbol metadata persistence.

Runtime data must live in the Signal K plugin data directory. Do not commit user
symbols, uploaded files, generated thumbnails, or SQLite databases to git.

The SQLite datastore must support:

- stable symbol ids
- namespace metadata
- display names and descriptions
- sanitized SVG file references
- role/tag metadata
- scale and anchor metadata
- GPX type/sym mapping metadata (free-form strings, default empty)
- nominal source width/height (internal; used to compute Freeboard display size for previews)
- created/updated timestamps

Sanitized SVG assets should be stored as files under the plugin data directory,
not in the source tree. SQLite should store metadata and asset file references;
it should not be treated as a general multi-provider symbol store.

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
style, including its anchor point at the tip of the symbol in the lower left.
Freeboard POI markers are "tag" shaped — a rounded rectangle body tapering to a
point at the lower-left, with a small circular hole near the point.
The Freeboard reference is a red note marker with a white diagonal stripe.
The Symbol Manager `POI` starter must use the same note-marker shape, but
without the white stripe, so the starter is a plain editable colored note
marker. The editor must provide a fill color picker that can change the note
marker fill color.


The `Flag` template should be an asset that appears as a flag on a staff, with
the anchor at the base of the staff.

The `Waypoint` template should be a classic map-pin teardrop shape (circular
head tapering to a point at the bottom) with a center dot, implemented as a
closed polygon so outline color/width and fill work correctly in the editor.

The template should also pre-populate the `roles`, `tags`, `scale`, and `anchor`
structure with defaults specified in the template definition `.json` file.
Templates with `note`, `waypoint`, or `map-marker` roles must define `scale` and
`anchor`.

### Freeboard Reference Information

FOR IMPLEMENTATION REFERENCE ONLY!

Freeboard-SK POI icon definitions use:

```ts
scale: 0.65
anchor: [1, 37]
```

Freeboard-SK builds map image styles using an OpenLayers `Icon` with the icon
URL as `src`, applying the configured `scale` and `anchor` with
`anchorXUnits` and `anchorYUnits` set to `pixels`. Symbol Manager previews for
Freeboard-SK map note usage must therefore render the symbol as:

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
  * editing GPX mapping metadata: `gpxType` and `gpxSym` (optional free-form
    text, grouped in their own fieldset)
 
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
  SVG source. A small boat-anchor icon or crosshair symbol is a suitable
  visual for the draggable marker.
  
  
## Software stack

The plugin UI will use React + Fabric.js. Fabric.js is the better fit for lightweight map-symbol creation than SVG-Edit because we can expose only the small tool surface needed for icons. Keep upload/source editing as fallback for complex SVGs.

For tag editing, use [`react-tag-input-component`](https://github.com/hc-oss/react-tag-input-component).
It supports TypeScript, keyboard entry, tag removal, uniqueness enforcement, and
accessible labels without requiring a hand-rolled tag editor.

For SVG sanitization, use [`@xmldom/xmldom`](https://github.com/xmldom/xmldom)
(pure JS) with a strict element/attribute allowlist — see *SVG Validation and
Sanitization*. Do not use DOMPurify; it requires jsdom, which leaks memory at
the native/realm level and is too heavy for a Raspberry Pi target.

## SVG Validation and Sanitization

Uploaded or edited SVG must be treated as untrusted.

The plugin should reject or remove:

- `<script>`
- event-handler attributes such as `onclick`
- `foreignObject`
- external network references
- unsafe embedded content
- files above the configured size limit

Implementation: sanitization is a strict **allowlist** over a pure-JS DOM
(`@xmldom/xmldom`, no jsdom). Only allowlisted SVG elements are kept (so
`<script>`, `<foreignObject>`, `<a>`, `<iframe>`, and any unknown element are
dropped); `on*` attributes, `href`/`src`/`xlink:href` that are not local
fragments / `data:image` / relative URLs, external `url(...)` references,
`javascript:` and CSS `expression()`, and unsafe `<style>` CSS are stripped;
internal entity definitions (`<!ENTITY>`) are rejected outright as an
XXE / billion-laughs guard; and input over the configured byte limit is rejected.

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

Public SVG asset route, registered directly on the app (NOT via
`registerWithRouter()`, so it is outside the server's `/plugins` admin gate and
is loadable by read-only consumers — `:ref` is a local id or a `namespace:id`):

```text
GET /signalk/symbol-manager/symbols/:ref.svg
```

Manager API routes registered with `registerWithRouter()` (mounted at
`/plugins/signalk-symbol-manager`, which the server protects with admin auth):

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

Implementation: the entire manager API lives under
`/plugins/signalk-symbol-manager/...`, and the Signal K server already gates every
`/plugins/*` route behind admin authentication, so mutation is protected by the
server's built-in admin gate and the plugin adds no auth middleware of its own.
The public SVG asset route is deliberately placed outside `/plugins`
(`/signalk/symbol-manager/...`) so symbol reads stay public when the server
permits read-only access.

Resource-provider `setResource` and `deleteResource` calls must remain read-only
rejections even for authenticated users. Authentication can authorize the plugin
manager API, but it must not turn the resources API into a second mutation path.

### Security Considerations

SVG can contain executable or risky content. Both providers and consumers should
be defensive.

Providers must:

- Sanitize all uploaded or editor-generated SVG before storage.
- Reject scripts, event-handler attributes, `foreignObject`, and external references.
- Enforce file size limits.
- Serve assets with accurate `Content-Type: image/svg+xml`.

Consumers should:

- Validate media type before registration.
- Avoid blindly injecting unsanitized SVG into the DOM.
- Prefer safe image loading mechanisms (e.g. `<img src="...">` rather than
  inline SVG injection) where practical.
- Fall back gracefully when an asset fails to load.

## Chart and Vector Renderer Notes

This plugin targets SVG symbols for UI and map overlay markers.

MVT, Mapbox/MapLibre style sprites, and S-57/ENC native chart portrayal are
renderer-specific and out of scope. Native S-57/ENC custom portrayal belongs in
a separate map-style or chart-portrayal implementation.

## Non-Goals

- Do not require a custom Signal K server build.
- Do not implement consumer application changes in this plugin.
- Do not implement native S-57/ENC portrayal.
- Do not store user-generated runtime data in git.
- Do not require consumers to support every optional symbol asset format.

## Verification Goals

Verification must include:

- `GET /signalk/v2/api/resources/symbols` returns namespace-qualified symbol keys.
- `GET /signalk/v2/api/resources/symbols/:resourceId` returns the requested symbol.
- unqualified `GET /signalk/v2/api/resources/symbols/:resourceId` succeeds only
  when the local id is unique and rejects ambiguous local ids.
- returned symbols include required `namespace` metadata.
- `POST`, `PUT`, and `DELETE` through `/signalk/v2/api/resources/symbols` reject
  without mutating the symbol library.
- SVG assets are served with the correct content type.
- unsafe SVG upload attempts are rejected or sanitized.
- plugin API create/edit/delete operations require authorization.
- a symbol-aware consumer app can discover and render a managed symbol.

## Test Plan

- Unit tests for namespace validation, canonical key generation, unqualified id
  ambiguity handling, SQLite metadata operations, SVG file writes, and sanitizer
  rejects.
- Integration tests against a local Signal K server:
  - provider registration appears under `/resources/symbols/_providers`
  - `GET /signalk/v2/api/resources/symbols` returns namespace-qualified keys
  - `GET /signalk/v2/api/resources/symbols/:resourceId` returns one symbol
  - unqualified resource lookup rejects ambiguous local ids
  - returned symbols include required `namespace` metadata
  - resource-provider `POST`, `PUT`, and `DELETE` reject without mutating data
  - SVG route returns `Content-Type: image/svg+xml`
  - plugin API create/update/delete require authorization
- UI tests for create, edit, duplicate, upload, delete, role/tag editing, anchor/scale editing, and Fabric.js export.

## Assumptions And Defaults

- Node requirement for the plugin is `>=22.5.0` because it uses `node:sqlite`.
- Supports SVG only; no PNG sprite generation, MapLibre sprite metadata, or S-57/ENC portrayal.
- Fabric.js visual editing may normalize complex uploaded SVGs. The plugin must preserve a source/upload path so users are not blocked when Fabric cannot round-trip an SVG cleanly.
