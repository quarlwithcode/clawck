# Clawck v0.5.0 — Stabilization Report

## Summary

This release addresses 16 identified gaps across version consistency, build infrastructure, API hardening, documentation accuracy, and code quality. No features were added — this is a pure stabilization release.

## Changes by Category

### Version Consistency (P0)
- MCP `serverInfo.version`: hardcoded `'0.4.0'` → `APP_VERSION` constant
- ATP `source_version`: hardcoded `'0.4.0'` → `APP_VERSION` constant
- Zero stale version strings remain in source (`grep -r "0.4.0" src/` returns nothing)

### Build Infrastructure (P0)
- **ESLint**: Installed with flat config (`eslint.config.mjs`), typescript-eslint rules, `npm run lint` clean
- **CI**: GitHub Actions workflow (`.github/workflows/ci.yml`) — Node 18/20/22 matrix, build → lint → test → CLI smoke test
- **`.gitignore`**: Added `.DS_Store`, `.env`, `.env.*`, `clawck-report-*`

### API Hardening (P0)
- Request body limit: `express.json({ limit: '1mb' })`
- CORS: Configurable `cors_origin` (default: allow all for localhost)
- `parseInt()` safety: `safeInt()` helper prevents NaN propagation from query params
- Silent catches: Ingest and ATP import now report per-entry errors in response
- Error middleware: Express built-in errors (413, etc.) properly forwarded

### Documentation (P0)
- README API table: 15 → 26 endpoints, organized by category
- Surface stability section added to README (stable vs experimental classification)
- `docs/api-reference.md`: Already accurate from prior session (verified)
- `docs/deprecation-policy.md`: Created with 0.x and post-1.0 lifecycle rules

### Config Validation (P1)
- Extracted `validateConfig()` from CLI into `src/core/config.ts`
- `createServer()` now validates config and throws on invalid input
- Exported from public SDK surface

### Structured Logging (P1)
- Created `src/core/logger.ts` with level/subsystem/timestamp format
- Respects `LOG_LEVEL` env var (default: info)
- Applied to: api server startup, webhook delivery, sync operations, hook handler

### Error Taxonomy (P1)
- `ClawckError`, `ValidationError`, `NotFoundError`, `ConfigError` in `src/core/errors.ts`
- Express error middleware maps `ClawckError` → proper HTTP status + `{ error, code }`
- Exported from public SDK surface

### Tests (P1)
- `test/pricing.test.ts`: 10 tests for `estimateCost`, `getModelPricing`, `MODEL_PRICING`
- `test/api-hardening.test.ts`: 10 tests for query param safety, oversized payloads, error format, config validation
- Total: 225 → 245 tests, all passing

### Pricing Module (P1)
- `estimateCost`, `getModelPricing`, `MODEL_PRICING` now exported from `src/index.ts`
- `ModelPricing` type exported

## Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Webhooks fire-and-forget | Low | No delivery guarantee, now logged on failure |
| No authentication | By design | Clawck is localhost-first; documented in `docs/security.md` |
| Pricing table maintenance | Low | Model prices are manually entered; may drift |
| No rate limiting | Low | No evidence of external exposure requiring it |

## Verification Results

| Check | Result |
|-------|--------|
| `npm run build` | Clean compile |
| `npm run lint` | Zero errors, zero warnings |
| `npm test` | 245 tests pass (23 files) |
| `node dist/cli/index.js --version` | `0.5.0` |
| `grep -r "0.4.0" src/` | Zero results |
| README API table vs api.ts routes | All 26 match |

## Version: 0.5.0

Recommended as a stabilization release — no breaking changes to public API surface. Safe upgrade from any 0.4.x version.

## Next Steps (Maintenance Mode)

- Monitor CI for regressions on PRs
- Keep pricing table updated as new models launch
- Consider webhook retry/delivery guarantees if users request it
- Plan 1.0 release when auth and Python SDK are in scope
