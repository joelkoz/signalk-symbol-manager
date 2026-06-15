# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Declare `express` as a runtime dependency. The plugin requires `express` to
  register its HTTP API/asset routes; it was previously resolved only
  transitively from signalk-server, so the plugin failed to load when installed
  standalone (for example in the Signal K plugin registry, which installs
  plugins on their own).

### Added
- SignalK plugin-CI workflow (`.github/workflows/signalk-ci.yml`) that runs the
  shared cross-platform test matrix.
- This changelog.

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
