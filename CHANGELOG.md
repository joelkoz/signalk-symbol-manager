# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Alias autocomplete now suggests the Freeboard-SK meteo wind-barb symbol names
  (`fsk:real-weatherStation-5` … `-75` and their `virtual-` counterparts), so a
  user can override an individual barb glyph. The base `weatherStation` windsock
  aliases remain listed for the calm / no-wind symbol.

## [1.0.0]

### Added
- Alias autocomplete: typing in a symbol's `namespace:id` alias field now
  suggests known vendor aliases (Freeboard-SK and Binnacle symbol names),
  making it easier to align managed symbols with the consumers that look them
  up.

## [0.6.3]

### Added
- "Circle" starter template: a Binnacle-style circle marker with a white fill,
  blue outline, and a center anchor. Editable fill color, and imported SVGs are
  sized to fit inside the circle (like the POI body box).
- SignalK plugin-CI workflow (`.github/workflows/signalk-ci.yml`) that runs the
  shared cross-platform test matrix.
- This changelog.

### Changed
- The editor's "Fit into POI body" action is now "Fit into body" — it applies to
  any template with an import body box (POI and Circle).

### Fixed
- Importing an SVG no longer auto-selects the added object, so the symbol
  metadata panel (aliases, roles, tags) stays visible after import.
- Declare `express` as a runtime dependency. The plugin requires `express` to
  register its HTTP API/asset routes; it was previously resolved only
  transitively from signalk-server, so the plugin failed to load when installed
  standalone (for example in the Signal K plugin registry, which installs
  plugins on their own).

## [0.6.2]

### Changed
- Symbol references support multiple `namespace:id` value pairs and allow
  hyphens in the namespace.
- Symbols refactored to a UUID + alias model; symbol-resolution strategy
  clarified.

## [0.5.0]

### Added
- Initial public release: create and manage chart symbols (icons for waypoints,
  notes, etc.). Registers a read-only `symbols` resource provider and ships a
  Signal K WebApp SVG editor served at `/signalk-symbol-manager/`.
- App-store screenshots and admin-styled UI.
