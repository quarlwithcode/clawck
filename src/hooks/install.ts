/**
 * ⏱️🦀 Clawck — Platform Install Configs
 * Generates platform-specific hook configuration and detects existing installs.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Platform } from './types';

export interface PlatformInstallInfo {
  name: string;
  displayName: string;
  configPaths: string[];
  snippetFile: string;
  generate: () => string;
  detect: () => boolean;
}

function homeDir(): string {
  return os.homedir();
}

export const PLATFORMS: Record<Exclude<Platform, 'unknown'>, PlatformInstallInfo> = {
  claude: {
    name: 'claude',
    displayName: 'Claude Code',
    configPaths: [
      path.join(homeDir(), '.claude', 'settings.json'),
      '.claude/settings.json',
    ],
    snippetFile: 'hooks-claude.json',
    generate: () => JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: "clawck hook start"
              }
            ]
          }
        ],
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: "clawck hook stop"
              }
            ]
          }
        ]
      }
    }, null, 2),
    detect: () => {
      const paths = [
        path.join(homeDir(), '.claude', 'settings.json'),
        path.resolve('.claude/settings.json'),
      ];
      return paths.some(p => {
        try {
          const content = fs.readFileSync(p, 'utf-8');
          return content.includes('clawck hook');
        } catch { return false; }
      });
    },
  },

  gemini: {
    name: 'gemini',
    displayName: 'Gemini CLI',
    configPaths: [
      path.join(homeDir(), '.gemini', 'settings.json'),
      '.gemini/settings.json',
    ],
    snippetFile: 'hooks-gemini.json',
    generate: () => JSON.stringify({
      hooks: {
        BeforeAgent: [
          {
            type: "command",
            command: "clawck hook start"
          }
        ],
        AfterAgent: [
          {
            type: "command",
            command: "clawck hook stop"
          }
        ]
      }
    }, null, 2),
    detect: () => {
      const paths = [
        path.join(homeDir(), '.gemini', 'settings.json'),
        path.resolve('.gemini/settings.json'),
      ];
      return paths.some(p => {
        try {
          const content = fs.readFileSync(p, 'utf-8');
          return content.includes('clawck hook');
        } catch { return false; }
      });
    },
  },

  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    configPaths: [
      '.cursor/hooks.json',
    ],
    snippetFile: 'hooks-cursor.json',
    generate: () => JSON.stringify({
      hooks: {
        pre_user_prompt: [
          {
            type: "command",
            command: "clawck hook start"
          }
        ],
        stop: [
          {
            type: "command",
            command: "clawck hook stop"
          }
        ]
      }
    }, null, 2),
    detect: () => {
      try {
        const content = fs.readFileSync(path.resolve('.cursor/hooks.json'), 'utf-8');
        return content.includes('clawck hook');
      } catch { return false; }
    },
  },

  cline: {
    name: 'cline',
    displayName: 'Cline',
    configPaths: [
      '.clinerules/hooks/',
    ],
    snippetFile: 'hooks-cline.txt',
    generate: () => [
      '# Cline Hook Scripts',
      '# Place these as executable scripts in .clinerules/hooks/',
      '',
      '# --- .clinerules/hooks/TaskStart ---',
      '#!/bin/bash',
      'clawck hook start',
      '',
      '# --- .clinerules/hooks/PostToolUse ---',
      '#!/bin/bash',
      'clawck hook stop',
    ].join('\n'),
    detect: () => {
      const dir = path.resolve('.clinerules/hooks');
      if (!fs.existsSync(dir)) return false;
      try {
        const files = fs.readdirSync(dir);
        return files.some(f => {
          try {
            const content = fs.readFileSync(path.join(dir, f), 'utf-8');
            return content.includes('clawck hook');
          } catch { return false; }
        });
      } catch { return false; }
    },
  },

  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    configPaths: [
      '.windsurf/hooks.json',
    ],
    snippetFile: 'hooks-windsurf.json',
    generate: () => JSON.stringify({
      hooks: {
        pre_user_prompt: [
          {
            type: "command",
            command: "clawck hook start"
          }
        ],
        post_agent: [
          {
            type: "command",
            command: "clawck hook stop"
          }
        ]
      }
    }, null, 2),
    detect: () => {
      try {
        const content = fs.readFileSync(path.resolve('.windsurf/hooks.json'), 'utf-8');
        return content.includes('clawck hook');
      } catch { return false; }
    },
  },

  codex: {
    name: 'codex',
    displayName: 'Codex',
    configPaths: [
      'codex.json',
    ],
    snippetFile: 'hooks-codex.json',
    generate: () => JSON.stringify({
      hooks: {
        "turn-start": [
          {
            type: "command",
            command: "clawck hook start"
          }
        ],
        "agent-turn-complete": [
          {
            type: "command",
            command: "clawck hook stop"
          }
        ]
      }
    }, null, 2),
    detect: () => {
      try {
        const content = fs.readFileSync(path.resolve('codex.json'), 'utf-8');
        return content.includes('clawck hook');
      } catch { return false; }
    },
  },

  openclaw: {
    name: 'openclaw',
    displayName: 'OpenClaw',
    configPaths: [
      path.join(homeDir(), '.openclaw', 'hooks'),
    ],
    snippetFile: 'hooks-openclaw.json',
    generate: () => JSON.stringify({
      hooks: {
        pre_prompt: [
          {
            type: "command",
            command: "clawck hook start --platform openclaw"
          }
        ],
        post_agent: [
          {
            type: "command",
            command: "clawck hook stop --platform openclaw"
          }
        ]
      }
    }, null, 2),
    detect: () => {
      const dir = path.join(homeDir(), '.openclaw', 'hooks');
      if (!fs.existsSync(dir)) return false;
      try {
        const files = fs.readdirSync(dir);
        return files.some(f => {
          try {
            const content = fs.readFileSync(path.join(dir, f), 'utf-8');
            return content.includes('clawck');
          } catch { return false; }
        });
      } catch { return false; }
    },
  },
};

export const PLATFORM_NAMES = Object.keys(PLATFORMS) as Exclude<Platform, 'unknown'>[];
