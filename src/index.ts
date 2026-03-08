/**
 * ⏱️🦀 Clawck
 * Time tracking for AI agents. Toggl for the agentic era.
 * 
 * @example
 * ```ts
 * import { Clawck } from 'clawck';
 * 
 * const clawck = new Clawck({ default_client: 'acme-corp' });
 * 
 * // Start tracking
 * const entry = clawck.start({ task: 'Research grants', project: 'grant-research', category: 'research' });
 * 
 * // ... agent does work ...
 * 
 * // Stop tracking
 * clawck.stop({ id: entry.id, status: 'completed', summary: 'Found 12 matching grants' });
 * 
 * // Get timesheet
 * const report = clawck.timesheet('2026-03-01', '2026-03-07');
 * console.log(`Saved ${report.total_savings_usd} in human-equivalent work`);
 * ```
 */

export { Clawck } from './core/clawck';
export { ClawckDB } from './core/database';
export { SyncManager } from './core/sync';
export { createServer, startServer } from './server/api';
export { startMCPServer } from './server/mcp';
export * from './core/types';
export { estimateAgentRuntime, calculateWallClock, DEFAULT_RUNTIME_CONFIG } from './core/runtime';
export type { RuntimeEstimatorConfig } from './core/runtime';
export { INDUSTRY_BENCHMARKS, lookupBenchmark, getCategoryMedian, computeIndustryMultiplier } from './core/benchmarks';
export type { IndustryBenchmark } from './core/benchmarks';
export { compareEntry } from './core/personal';
export type { PersonalBaseline, PersonalComparisonResult } from './core/personal';
export { validateConfig } from './core/config';
export type { ConfigValidationResult } from './core/config';
export { validateEntry, migrateV1toV2, exportATP, importATP } from './core/atp';
export type { ATPExportEnvelope, EntryComparison } from './core/atp';
export { resolvePeriod } from './reports/periods';
export type { StoredReport, ReportMetadata, ReportPeriod, ReportStyle, ReportFormat } from './core/types';
