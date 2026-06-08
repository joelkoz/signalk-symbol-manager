# Signal K Symbol Manager

Create and manage a library of symbols for your charts. Waypoints, note markers, etc.

Symbol Manager is a plugin for your Signal K server that acts as both a "symbol resource provider" as well as a web app for building and managing a library of
custom SVG symbols — note markers, waypoints, map pins, flags, status icons —
that symbol-aware Signal K apps (like Freeboard-SK) can display on your charts
and dashboards.

You can:

- start from a built-in template (POI / Flag / Waypoint / Blank) or upload an
  existing SVG file,
- edit the symbol in a lightweight visual editor — shapes, text, colors,
  outlines, opacity, layering,
- set the anchor point and display scale that map apps use to place the
  symbol on a chart,
- preview the symbol against a sample chart background at the size it will
  actually appear,
- **replace** the built-in icons in consumer apps by giving your symbol the
  same id as the one they ship with.

## Requirements

- Signal K Server 2.x with the resource provider API.
- Node.js 22.5 or newer (the plugin uses Node's built-in SQLite).
- A symbol-aware consumer app. **Freeboard-SK** is the reference consumer app.


## Installing

Install through the Signal K Server **Appstore** (search for *Symbol
Manager*) and restart the server, then enable the plugin in the **Plugin
Config** screen. There is nothing to configure — the plugin is ready to use
as soon as it's enabled.

## Opening the Symbol Manager

After the plugin is enabled, open the Signal K admin UI and choose
**Webapps → Symbol Manager**. The library is empty the first time you open
it.

The library lives in your Signal K data directory and is *not* tracked by
git — your symbols are yours.

## The library list

The main screen lists every symbol in your library, with its thumbnail,
name, description, roles, tags, and per-row actions:

| Action      | What it does                                                                |
|-------------|-----------------------------------------------------------------------------|
| **Edit**    | Open the visual editor on this symbol.                                      |
| **Duplicate** | Make a copy under a new id (e.g. `dive-site` → `dive-site-2`).            |
| **Delete**  | Remove the symbol from the library (and its SVG file from disk).            |

Across the top:

- **Refresh** — re-fetch the list from the server.
- **Upload SVG** — see *Direct upload* below.
- **New** — start a new symbol from a template.

## Creating a symbol from a template

**New** opens the template picker:

| Template     | What it gives you                                                        |
|--------------|--------------------------------------------------------------------------|
| **POI**      | A "Point of Interest" symbol.  Apps like Freeboard-SK use this as the note-marker shape (the colored "tag" with a hole). The fill color of the body is editable. Has a defined "body area" — any shape you import drops into it automatically. |
| **Flag**     | A flag-on-a-staff marker. The anchor sits at the base of the staff.       |
| **Waypoint** | A classic map-pin teardrop with a center dot.                            |
| **Blank**    | An empty 48×48 canvas — build a symbol from scratch.                     |

Pick one and the editor opens with the template's default shape, default
roles, and (for map-marker templates) a sensible default scale and anchor.

## The editor

The editor has three areas:

```
┌──────────────────────────┬─────────────────────┐
│         toolbar          │      Preview        │
├──────────────────────────┤   (chart sample)    │
│                          │                     │
│         canvas           │ ───────────────     │
│   (drawing area, with    │      Properties     │
│    chequerboard back-    │  (symbol-wide or    │
│    ground showing the    │   per-shape, de-    │
│    SVG bounds)           │   pending on what   │
│                          │   is selected)      │
└──────────────────────────┴─────────────────────┘
```

### Toolbar

| Button | What it does                                                       |
|--------|--------------------------------------------------------------------|
| ▭      | Adds a rectangle                                                   |
| ◯      | Adds a circle                                                      |
| ╱      | Adds a line                                                        |
| →      | Adds an arrow                                                      |
| T      | Adds a text box                                                    |
| ⬠      | Polygon / polyline (see *Drawing polygons*).                       |
| Import | Add another SVG file as a shape inside the symbol.                 |
| ↶ Undo | Undo the last change (also Cmd/Ctrl-Z).                            |
| Zoom   | Slider — zooms the editor view only (does not change the symbol).  |

### Selecting and editing shapes

- **Click** a shape to select it. Its properties appear on the right.
- **Click again** in the same spot to cycle through shapes stacked on top of
  each other — useful when one shape is hidden behind another.
- **Drag** a selected shape to move it; drag its handles to resize or
  rotate.
- **Backspace** / **Delete** removes the selected shape.
- **Cmd/Ctrl-Z** undoes the last change.

### Drawing polygons

Click **⬠** button, then:

1. Click each vertex on the canvas. A dashed rubber-band line follows the
   cursor.
2. **Double-click** to finish as an open polyline (good for tracks /
   strokes).
3. Or **click the start point** (highlighted with a small circle) to close
   the shape — a closed polygon takes a fill color.
4. **Esc** cancels the drawing.

### Setting the anchor

The blue ⊕ marker on the canvas is the **anchor point** — the pixel that
consumer apps will place at the actual chart location. Drag the marker to
move the anchor; the X/Y fields update as you drag. The marker is editor-only
and is not written into the saved SVG. Instead, it is saved to "Map-marker metadata"
property of the symbol.

### Importing another SVG into the symbol

**Import** prompts for an SVG file, sanitizes it, and drops it onto the
canvas as a new shape group. When you're working on a **POI** template, the
import is automatically scaled and centered into the POI's "body area". 
For any other template, the import drops in at half size, centered. After import you can
move and scale it like any other shape, and a **Fit into POI body** button
in the right-hand panel re-runs the auto-fit any time.

### Zooming and panning

- The **Zoom** slider shows the view percentage. The minimum zoom is the
  size at which the whole symbol fills the editor (typically a few hundred
  percent); the maximum is 3000%.
- When zoomed in, scrollbars appear inside the canvas frame. Drag them to
  pan.
- **Shift + click-drag** anywhere on the canvas pans the view.
- **Mouse wheel / two-finger trackpad scroll** also pans (vertical wheel by
  default, **Shift + wheel** to pan horizontally).
- Zoom changes only how the editor *looks*. The saved symbol is unaffected.

### Shape properties

Selecting a shape shows controls for that shape:

- **Text** field and **Font** picker (for text shapes).
- **X / Y / W / H** in source pixels.
- **Fill** and **Outline** color pickers (with a *none* button for
  transparent fill), and **Outline width**.
- **Opacity** slider, 0–100 %.
- **Bring forward** / **Send backward** for stacking order.
- **Fit into POI body** (only on the POI template).
- **Delete shape**.

### Symbol-wide properties

With nothing selected, the panel shows whole-symbol metadata. Click anywhere
in the editor that is outside of the symbol to show the symbol-wide properties:

- **Id** - The identifier used by the consumer app (e.g. Freeboard SK)
- **Namespace** - Used to distinguish symbols with the same **Id**
- **Name** - Human readable name
- **Description** - Human readable description
- **Roles** - checkboxes describing what the symbol is *for*. The ones
  tagged with a **chart** badge (`note`, `waypoint`, `map-marker`) mean the
  symbol will be placed on a chart, which makes **Scale** and **Anchor**
  required.
- **Tags** - free-form keywords for search / filtering.
- **Map-marker metadata** - **Scale** and **Anchor (X, Y)**. The fieldset
  turns amber and is labelled *required* when any chart-role checkbox is
  ticked.

### Preview

The preview pane shows the symbol against a sample nautical chart
background, at the displayed size a consumer app will use:

```
displayed width  = source SVG width  × scale
displayed height = source SVG height × scale
```

The **Scale** slider edits the symbol's scale metadata directly (it's not
just a preview zoom). The *reset* link puts it back to the default (0.65,
matching Freeboard's POI scale).

### View / edit SVG source

The **View / edit SVG source** link drops down a textarea with the raw SVG
for the current canvas. You can hand-edit and click **Sanitize & apply to
canvas** to push your edits back into the editor. The text is sanitized
first, so any script / external reference / disallowed element is stripped
before it lands on the canvas.

### Saving

**Save** sanitizes the SVG, validates that map-marker symbols have a scale
and anchor, and writes the symbol to the library.

## Direct upload (bypassing the editor)

The visual editor handles a focused set of SVG features. If you have a
complex SVG (gradients, filters, embedded fonts, intricate paths) that the
editor would normalize away, use **Upload SVG** from the library list to
add the file directly. You'll be asked to fill in the metadata (and, for
map-marker symbols, scale and anchor) in a small form. The file is sanitized
and stored as-is, with no editor round-trip.

## Symbol references and overriding default icons

This is how custom symbols **replace** the built-in icons in consumer apps.

Every symbol has a **namespace** and an **id**, saved internally as
`namespace:id` — for example `user:dive-site`. The Symbol Manager stores
all symbols under the namespace **`user`** by default.

Consumer apps that support symbol resources can ask the Signal K server
for a symbol either way:

| Lookup kind  | Example                                                | Returns                                                |
|--------------|--------------------------------------------------------|--------------------------------------------------------|
| Qualified    | `user:dive-site`                                       | Always your `user:dive-site` symbol.                   |
| Unqualified  | `dive-site`                                            | The single symbol with that id, **regardless of namespace**. |

That second form is what makes overrides work. Consumer apps typically ship
default icons under their own namespace (e.g. Freeboard-SK ships
`dive-site`, `anchor`, `mooring`, etc.). When the app asks the Signal K
server for `dive-site` *without* a namespace and the Symbol Manager has
**exactly one** symbol with id `dive-site`, the server returns yours — so
your custom drawing appears on the chart in place of the app's built-in
one.

**To replace a built-in icon:**

1. Find the id the consumer app uses (Freeboard's POI types are documented
   in its own docs — e.g. `dive-site`, `anchor`, `mooring`, `marina`,
   `restaurant`, …).
2. In the Symbol Manager, create a new symbol with the **same id**.
   Leave the namespace as `user` (default).
3. Save. The consumer app picks up your symbol the next time it asks for
   that id.

A few notes:

- The override only works for **unqualified** lookups. If the consumer app
  hard-codes the qualified `built-in:dive-site` form, your `user:dive-site`
  symbol will not replace it. Most consumer apps that support overrides use
  the unqualified form on purpose.
- If you create the *same* id under two different namespaces, the
  unqualified lookup becomes ambiguous and the server returns an error
  instead of guessing. Pick one namespace per id.
- The id must match `[A-Za-z0-9_-]+` — letters, digits, underscores, and
  dashes only.

## Where things are stored

Symbols and the SQLite metadata index live under your Signal K plugin data
directory:

```
<signalk-data-dir>/plugin-config-data/signalk-symbol-manager/
   symbols.sqlite       # metadata index
   assets/<namespace>/<id>.svg    # the SVG files themselves
```

To back up your library, copy that directory. To start fresh, stop the
server, delete it, and restart.

## Limitations

- The visual editor is intentionally small and focused on map-marker
  symbols. For anything that would tax it, use **Upload SVG**.
- Symbol creation, edits, and deletes go through the manager UI and require
  Signal K **admin** access. Reading symbols is public if your server
  allows read-only resource access.
- The plugin does not generate native S-57 / ENC chart-portrayal catalogs —
  that's a future enhancement.

## License

Apache-2.0 — see [LICENSE](LICENSE).
