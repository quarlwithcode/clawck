/**
 * ⏱️🦀 Clawck — Personal Baselines
 * Compare agent performance against your own personal speed.
 */

import { ClawckEntry, TaskCategory } from './types';
import { IndustryBenchmark, lookupBenchmark } from './benchmarks';

export interface PersonalBaseline {
  id: string;
  category: TaskCategory;
  task_type: string;
  description: string;
  my_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface PersonalComparisonResult {
  agent_minutes: number;
  personal_minutes: number | null;
  industry_median_minutes: number | null;
  personal_speedup: number | null;
  industry_speedup: number | null;
  personal_savings_usd: number | null;
  industry_savings_usd: number | null;
}

export function compareEntry(
  entry: ClawckEntry,
  baselines: PersonalBaseline[],
  benchmarks: IndustryBenchmark[],
  personalRate: number
): PersonalComparisonResult {
  // Agent time: prefer agent_runtime_ms, fallback to wall clock
  const agentMs = (entry as any).agent_runtime_ms
    || (entry.end ? new Date(entry.end).getTime() - new Date(entry.start).getTime() : 0);
  const agentMinutes = agentMs / 60000;

  // Find personal baseline match
  const personalBaseline = findPersonalBaseline(entry, baselines);
  const personalMinutes = personalBaseline ? personalBaseline.my_minutes : null;

  // Find industry benchmark
  const benchmark = lookupBenchmark(entry.category, entry.task);
  const industryMinutes = benchmark ? benchmark.human_median_minutes : null;

  // Calculate speedups
  const personalSpeedup = personalMinutes && agentMinutes > 0
    ? Math.round((personalMinutes / agentMinutes) * 10) / 10
    : null;
  const industrySpeedup = industryMinutes && agentMinutes > 0
    ? Math.round((industryMinutes / agentMinutes) * 10) / 10
    : null;

  // Calculate savings
  const personalSavings = personalMinutes
    ? Math.round(((personalMinutes - agentMinutes) / 60) * personalRate * 100) / 100
    : null;
  const industrySavings = industryMinutes
    ? Math.round(((industryMinutes - agentMinutes) / 60) * personalRate * 100) / 100
    : null;

  return {
    agent_minutes: Math.round(agentMinutes * 100) / 100,
    personal_minutes: personalMinutes,
    industry_median_minutes: industryMinutes,
    personal_speedup: personalSpeedup,
    industry_speedup: industrySpeedup,
    personal_savings_usd: personalSavings,
    industry_savings_usd: industrySavings,
  };
}

function findPersonalBaseline(entry: ClawckEntry, baselines: PersonalBaseline[]): PersonalBaseline | null {
  // First try exact category + task_type match
  const catBaselines = baselines.filter(b => b.category === entry.category);
  if (catBaselines.length === 0) return null;

  // Try keyword matching on task description
  const lower = entry.task.toLowerCase();
  for (const b of catBaselines) {
    const keywords = b.task_type.replace(/_/g, ' ').split(' ');
    if (keywords.some(k => k.length > 2 && lower.includes(k))) {
      return b;
    }
  }

  // Return first category match as fallback
  return catBaselines[0];
}
