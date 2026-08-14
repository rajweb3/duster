import type { DigestConfig } from './sections.js';

export interface HermesSkillDefinition {
  name: string;
  version: string;
  description: string;
  systemPrompt: string;
  tools: SkillTool[];
  triggers: SkillTrigger[];
}

interface SkillTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

interface SkillTrigger {
  type: 'event' | 'schedule';
  source?: string;
  event?: string;
  cron?: string;
}

export function createDailyDigestSkill(config: DigestConfig): HermesSkillDefinition {
  return {
    name: 'daily-digest',
    version: '1.0.0',
    description: 'Generate and deliver a daily summary of team activity, deadlines, and metrics',

    systemPrompt: buildSystemPrompt(config),

    tools: [
      {
        name: 'gather_activity',
        description: 'Collect activity data from connected channels for the past 24 hours',
        parameters: {
          period_hours: { type: 'number', description: 'Hours of activity to include', required: true },
        },
      },
      {
        name: 'gather_deadlines',
        description: 'Collect upcoming deadlines from connected project tools',
        parameters: {
          days_ahead: { type: 'number', description: 'Number of days ahead to check', required: true },
        },
      },
      {
        name: 'gather_metrics',
        description: 'Collect current metric snapshots',
        parameters: {},
      },
      {
        name: 'deliver_digest',
        description: 'Format and deliver the digest via the configured channel',
        parameters: {
          content: { type: 'string', description: 'Formatted digest content in markdown', required: true },
          channel: { type: 'string', description: 'Delivery channel: slack or email', required: true },
        },
      },
    ],

    triggers: [
      {
        type: 'schedule',
        cron: config.schedule,
      },
    ],
  };
}

function buildSystemPrompt(config: DigestConfig): string {
  const lines = [
    'You are a daily digest generator for a small team.',
    'Your role is to compile a clear, actionable summary of the day\'s activity.',
    '',
    'Guidelines:',
    '- Keep the digest concise — highlight what matters, skip the noise',
    '- Lead with overdue items and urgent action items',
    '- Include trend indicators for metrics (improving, declining, stable)',
    '- Use bullet points, not paragraphs',
    '',
    `Delivery channel: ${config.deliveryChannel}`,
    `Sections to include: ${config.sections.join(', ')}`,
    `Schedule: ${config.schedule}`,
  ];

  return lines.join('\n');
}
