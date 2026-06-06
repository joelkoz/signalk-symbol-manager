# Agent Instructions

Before changing or debugging this repository, read:

1. `README.md`
2. `REQUIREMENTS.md`
3. `MEMORY.md`, if present

This project currently contains implementation-spec documents only. Do not add
implementation code until the user explicitly starts the implementation phase.

The plugin must remain a normal Signal K server plugin and web app. It should
not require a custom Signal K server build for end users. The Resource Provider
API already supports custom resource types, and this plugin should register as
a provider for `symbols`.

Keep user-created symbol data out of git. Runtime data should live in the
Signal K plugin data directory, with SQLite used only for user-managed library
metadata and SVG storage/indexing as needed.

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
