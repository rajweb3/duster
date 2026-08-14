import type { SlackTriageConfig } from './types.js';

export interface HermesSkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  trigger: SkillTrigger;
  config: SlackTriageConfig;
  tools: string[];
  systemPrompt: string;
}

export interface SkillTrigger {
  type: 'event' | 'schedule' | 'manual';
  eventSource?: string;
  schedule?: string;
}

export function createSlackTriageSkill(config: Partial<SlackTriageConfig> = {}): HermesSkillDefinition {
  const fullConfig: SlackTriageConfig = {
    sourceChannels: config.sourceChannels || ['general'],
    routingRules: config.routingRules || [],
    summaryChannel: config.summaryChannel,
    digestSchedule: config.digestSchedule || '0 9 * * 1-5',
    urgencyKeywords: config.urgencyKeywords || ['outage', 'down', 'p0', 'incident', 'sev1'],
    autoReply: config.autoReply ?? false,
  };

  return {
    id: 'slack-triage',
    name: 'Slack Triage',
    description: 'Automatically categorize and route incoming Slack messages based on content, urgency, and configurable rules.',
    version: '0.1.0',
    trigger: {
      type: 'event',
      eventSource: 'slack:message',
    },
    config: fullConfig,
    tools: ['slack_read_channel', 'slack_post_message', 'slack_add_reaction'],
    systemPrompt: buildSystemPrompt(fullConfig),
  };
}

function buildSystemPrompt(config: SlackTriageConfig): string {
  return `You are a Slack triage agent. Your job is to:
1. Monitor messages in channels: ${config.sourceChannels.join(', ')}
2. Categorize each message by type (bug, feature request, question, scheduling, deployment, general)
3. Assess urgency (low, medium, high, urgent)
4. Route to the appropriate channel based on routing rules
5. Generate a brief summary for the triage log

Rules:
- Urgency keywords that trigger urgent priority: ${config.urgencyKeywords.join(', ')}
- ${config.autoReply ? 'Send a confirmation reply to the author after routing' : 'Do NOT auto-reply to messages'}
- ${config.summaryChannel ? `Post daily digest to #${config.summaryChannel}` : 'No daily digest configured'}

Be concise. Be accurate. When uncertain about routing, default to keeping the message in place and flagging for human review.`;
}

export function validateSkillConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const c = config as Record<string, unknown>;

  if (!Array.isArray(c.sourceChannels) || c.sourceChannels.length === 0) {
    errors.push('sourceChannels must be a non-empty array');
  }

  if (!Array.isArray(c.routingRules)) {
    errors.push('routingRules must be an array');
  } else {
    for (let i = 0; i < c.routingRules.length; i++) {
      const rule = c.routingRules[i] as any;
      if (!rule.id) errors.push(`routingRules[${i}].id is required`);
      if (!rule.targetChannel) errors.push(`routingRules[${i}].targetChannel is required`);
      if (!Array.isArray(rule.conditions)) errors.push(`routingRules[${i}].conditions must be an array`);
    }
  }

  if (c.urgencyKeywords !== undefined && !Array.isArray(c.urgencyKeywords)) {
    errors.push('urgencyKeywords must be an array');
  }

  return { valid: errors.length === 0, errors };
}
