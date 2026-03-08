# Deprecation Policy

## During 0.x (current)

- Breaking changes may happen in **minor** versions (e.g., 0.5.0 → 0.6.0)
- All breaking changes are documented in [CHANGELOG.md](../CHANGELOG.md)
- Experimental features (labeled in README) may change without notice

## Post 1.0 (planned)

- Breaking changes require a **major** version bump
- Deprecated features receive at least **1 minor version** deprecation notice before removal
- Deprecation notices appear in:
  - CHANGELOG.md
  - Console warnings at runtime (via structured logger)

## Config Keys

- Deprecated config keys will log a warning for **2 minor versions** before removal
- The warning includes the replacement key/approach

## Experimental Features

Features labeled "Experimental" in the README:
- May change behavior, API shape, or be removed without a deprecation cycle
- Current experimental features: webhooks, multi-agent sync, pricing estimation

## Stable Surface

Features labeled "Stable" in the README:
- Will follow the deprecation policy above
- Current stable surfaces: CLI commands, REST API, MCP tools, SQLite storage, ATP export/import
