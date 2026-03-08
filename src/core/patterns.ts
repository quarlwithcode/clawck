/**
 * ⏱️🦀 Clawck — Default Tracking Patterns
 * Templates for common agent task types.
 */

import { TrackingPattern } from './types';

export const DEFAULT_PATTERNS: TrackingPattern[] = [
  {
    name: 'default',
    description: 'General task tracking',
    category: 'other',
  },
  {
    name: 'code-review',
    description: 'Code review and refactoring',
    category: 'code',
    tags: ['review'],
  },
  {
    name: 'research',
    description: 'Research and analysis',
    category: 'research',
  },
  {
    name: 'content-creation',
    description: 'Content writing and generation',
    category: 'content',
  },
  {
    name: 'testing',
    description: 'Writing and running tests',
    category: 'testing',
  },
];
