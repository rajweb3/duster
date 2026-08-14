import { describe, it, expect } from 'vitest';
import { classifyMessage } from './classifier.js';
import { createSlackTriageSkill, validateSkillConfig } from './skill-definition.js';
import type { SlackMessage, RoutingRule } from './types.js';

const makeMessage = (content: string, overrides: Partial<SlackMessage> = {}): SlackMessage => ({
  id: 'msg_1',
  channel: 'general',
  author: 'user1',
  content,
  timestamp: Date.now(),
  ...overrides,
});

const rules: RoutingRule[] = [
  {
    id: 'rule_bugs',
    name: 'Bug reports',
    conditions: [{ field: 'content', operator: 'contains', value: 'bug' }],
    targetChannel: 'engineering',
    priority: 'high',
    autoLabel: 'bug',
  },
  {
    id: 'rule_sales',
    name: 'Sales inquiries',
    conditions: [{ field: 'content', operator: 'contains', value: 'pricing' }],
    targetChannel: 'sales',
    priority: 'medium',
  },
  {
    id: 'rule_urgent',
    name: 'Urgent from boss',
    conditions: [
      { field: 'author', operator: 'equals', value: 'ceo' },
      { field: 'content', operator: 'contains', value: 'urgent' },
    ],
    targetChannel: 'priority',
    priority: 'urgent',
  },
];

const urgencyKeywords = ['outage', 'down', 'p0', 'incident'];

describe('classifyMessage', () => {
  it('routes bug reports to engineering', () => {
    const result = classifyMessage(makeMessage('Found a bug in the login page'), rules, urgencyKeywords);
    expect(result.routedTo).toBe('engineering');
    expect(result.priority).toBe('high');
    expect(result.category).toBe('bug_report');
    expect(result.confidence).toBe(0.9);
  });

  it('routes pricing questions to sales', () => {
    const result = classifyMessage(makeMessage('Can you tell me about pricing?'), rules, urgencyKeywords);
    expect(result.routedTo).toBe('sales');
    expect(result.priority).toBe('medium');
  });

  it('routes multi-condition rule', () => {
    const result = classifyMessage(
      makeMessage('This is urgent, need it today', { author: 'ceo' }),
      rules,
      urgencyKeywords,
    );
    expect(result.routedTo).toBe('priority');
    expect(result.priority).toBe('urgent');
  });

  it('fails multi-condition if only one matches', () => {
    const result = classifyMessage(
      makeMessage('This is urgent', { author: 'intern' }),
      rules,
      urgencyKeywords,
    );
    expect(result.routedTo).not.toBe('priority');
  });

  it('detects urgent via keywords', () => {
    const result = classifyMessage(makeMessage('We have a p0 incident'), [], urgencyKeywords);
    expect(result.priority).toBe('urgent');
  });

  it('detects low priority signals', () => {
    const result = classifyMessage(makeMessage('FYI the docs are updated'), [], []);
    expect(result.priority).toBe('low');
  });

  it('defaults to medium for unknown content', () => {
    const result = classifyMessage(makeMessage('Just sharing an update on the project'), [], []);
    expect(result.priority).toBe('medium');
  });

  it('categorizes questions', () => {
    const result = classifyMessage(makeMessage('How do I reset my password?'), [], []);
    expect(result.category).toBe('question');
  });

  it('categorizes deployment', () => {
    const result = classifyMessage(makeMessage('Ready to deploy the new feature'), [], []);
    expect(result.category).toBe('deployment');
  });

  it('categorizes feature requests', () => {
    const result = classifyMessage(makeMessage('feature request: dark mode support'), [], []);
    expect(result.category).toBe('feature_request');
  });

  it('generates summary for long messages', () => {
    const longMsg = 'A'.repeat(200);
    const result = classifyMessage(makeMessage(longMsg), [], []);
    expect(result.summary.length).toBeLessThanOrEqual(120);
    expect(result.summary.endsWith('...')).toBe(true);
  });

  it('keeps short messages as-is', () => {
    const result = classifyMessage(makeMessage('Short message'), [], []);
    expect(result.summary).toBe('Short message');
  });

  it('returns unrouted when no rules match', () => {
    const result = classifyMessage(makeMessage('Just chatting'), [], []);
    expect(result.routedTo).toBeNull();
    expect(result.confidence).toBe(0.6);
  });

  it('adds autoLabel as suggestedAction', () => {
    const result = classifyMessage(makeMessage('Found a bug'), rules, urgencyKeywords);
    expect(result.suggestedAction).toBe('label:bug');
  });

  it('handles regex conditions', () => {
    const regexRules: RoutingRule[] = [
      {
        id: 'rule_ticket',
        name: 'Ticket references',
        conditions: [{ field: 'content', operator: 'matches', value: 'JIRA-\\d+' }],
        targetChannel: 'tickets',
        priority: 'medium',
      },
    ];
    const result = classifyMessage(makeMessage('See JIRA-1234 for details'), regexRules, []);
    expect(result.routedTo).toBe('tickets');
  });
});

describe('createSlackTriageSkill', () => {
  it('creates default skill definition', () => {
    const skill = createSlackTriageSkill();
    expect(skill.id).toBe('slack-triage');
    expect(skill.trigger.type).toBe('event');
    expect(skill.trigger.eventSource).toBe('slack:message');
    expect(skill.config.sourceChannels).toEqual(['general']);
    expect(skill.config.autoReply).toBe(false);
    expect(skill.tools).toContain('slack_read_channel');
  });

  it('creates customized skill', () => {
    const skill = createSlackTriageSkill({
      sourceChannels: ['support', 'sales'],
      urgencyKeywords: ['fire', 'help'],
      autoReply: true,
    });
    expect(skill.config.sourceChannels).toEqual(['support', 'sales']);
    expect(skill.config.urgencyKeywords).toEqual(['fire', 'help']);
    expect(skill.config.autoReply).toBe(true);
    expect(skill.systemPrompt).toContain('support, sales');
  });

  it('includes urgency keywords in prompt', () => {
    const skill = createSlackTriageSkill({ urgencyKeywords: ['meltdown'] });
    expect(skill.systemPrompt).toContain('meltdown');
  });
});

describe('validateSkillConfig', () => {
  it('validates correct config', () => {
    const result = validateSkillConfig({
      sourceChannels: ['general'],
      routingRules: [{ id: 'r1', targetChannel: 'eng', conditions: [] }],
      urgencyKeywords: ['urgent'],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects null config', () => {
    const result = validateSkillConfig(null);
    expect(result.valid).toBe(false);
  });

  it('requires non-empty sourceChannels', () => {
    const result = validateSkillConfig({ sourceChannels: [], routingRules: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('sourceChannels');
  });

  it('validates routing rules structure', () => {
    const result = validateSkillConfig({
      sourceChannels: ['general'],
      routingRules: [{ name: 'bad rule' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('id is required'))).toBe(true);
    expect(result.errors.some(e => e.includes('targetChannel is required'))).toBe(true);
  });

  it('requires routingRules to be array', () => {
    const result = validateSkillConfig({ sourceChannels: ['general'], routingRules: 'not array' });
    expect(result.valid).toBe(false);
  });
});
