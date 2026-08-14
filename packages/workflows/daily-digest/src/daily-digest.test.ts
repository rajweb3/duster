import { describe, it, expect } from 'vitest';
import {
  buildDigestContent,
  formatDigestMarkdown,
  validateCronExpression,
  type DigestConfig,
  type ActivitySummary,
  type DeadlineItem,
  type MetricSnapshot,
  type ActionItem,
} from './sections.js';
import { createDailyDigestSkill } from './skill-definition.js';

const config: DigestConfig = {
  schedule: '0 9 * * 1-5',
  deliveryChannel: 'slack',
  sections: ['activity', 'deadlines', 'metrics', 'action_items'],
};

describe('daily digest sections', () => {
  describe('buildDigestContent', () => {
    it('includes requested sections only', () => {
      const limitedConfig: DigestConfig = { ...config, sections: ['activity'] };
      const content = buildDigestContent(limitedConfig, {
        activity: { totalMessages: 50, channelsActive: 5, topChannels: [], period: { start: 0, end: 1 } },
        deadlines: [{ title: 'x', dueDate: 100, source: 'y', isOverdue: false }],
      });
      expect(content.sections.activity).toBeDefined();
      expect(content.sections.deadlines).toBeUndefined();
    });

    it('sorts deadlines with overdue first', () => {
      const content = buildDigestContent(config, {
        deadlines: [
          { title: 'Future', dueDate: 9999, source: 'a', isOverdue: false },
          { title: 'Overdue', dueDate: 1, source: 'b', isOverdue: true },
          { title: 'Soon', dueDate: 100, source: 'c', isOverdue: false },
        ],
      });
      expect(content.sections.deadlines![0].title).toBe('Overdue');
      expect(content.sections.deadlines![1].title).toBe('Soon');
      expect(content.sections.deadlines![2].title).toBe('Future');
    });

    it('sorts action items by priority', () => {
      const content = buildDigestContent(config, {
        actionItems: [
          { description: 'Low', source: 'x', priority: 'low', createdAt: 0 },
          { description: 'High', source: 'x', priority: 'high', createdAt: 0 },
          { description: 'Medium', source: 'x', priority: 'medium', createdAt: 0 },
        ],
      });
      expect(content.sections.actionItems![0].description).toBe('High');
      expect(content.sections.actionItems![1].description).toBe('Medium');
      expect(content.sections.actionItems![2].description).toBe('Low');
    });

    it('includes generatedAt timestamp', () => {
      const content = buildDigestContent(config, {});
      expect(content.generatedAt).toBeGreaterThan(0);
    });
  });

  describe('formatDigestMarkdown', () => {
    it('includes activity section', () => {
      const content = buildDigestContent(config, {
        activity: { totalMessages: 42, channelsActive: 3, topChannels: [{ name: '#general', count: 20 }], period: { start: 0, end: 1 } },
      });
      const md = formatDigestMarkdown(content);
      expect(md).toContain('# Daily Digest');
      expect(md).toContain('42');
      expect(md).toContain('#general');
    });

    it('marks overdue deadlines', () => {
      const content = buildDigestContent(config, {
        deadlines: [{ title: 'Late task', dueDate: 1, source: 'jira', isOverdue: true }],
      });
      const md = formatDigestMarkdown(content);
      expect(md).toContain('OVERDUE');
      expect(md).toContain('Late task');
    });

    it('shows metric trends', () => {
      const content = buildDigestContent(config, {
        metrics: [{ name: 'Response time', value: 120, unit: 'ms', trend: 'down', previousValue: 150 }],
      });
      const md = formatDigestMarkdown(content);
      expect(md).toContain('↓');
      expect(md).toContain('120ms');
    });

    it('shows action item priority tags', () => {
      const content = buildDigestContent(config, {
        actionItems: [{ description: 'Fix bug', source: 'slack', priority: 'high', createdAt: 0, assignee: 'alice' }],
      });
      const md = formatDigestMarkdown(content);
      expect(md).toContain('[HIGH]');
      expect(md).toContain('@alice');
    });
  });

  describe('validateCronExpression', () => {
    it('validates standard cron', () => {
      expect(validateCronExpression('0 9 * * 1-5')).toBe(true);
      expect(validateCronExpression('30 8 * * *')).toBe(true);
      expect(validateCronExpression('0 0 1 * *')).toBe(true);
    });

    it('rejects invalid cron', () => {
      expect(validateCronExpression('invalid')).toBe(false);
      expect(validateCronExpression('60 9 * * *')).toBe(false);
      expect(validateCronExpression('0 25 * * *')).toBe(false);
      expect(validateCronExpression('* * * *')).toBe(false);
    });

    it('accepts ranges', () => {
      expect(validateCronExpression('0 9-17 * * 1-5')).toBe(true);
    });

    it('accepts lists', () => {
      expect(validateCronExpression('0 9,12,17 * * *')).toBe(true);
    });
  });
});

describe('daily digest skill definition', () => {
  it('creates valid skill', () => {
    const skill = createDailyDigestSkill(config);
    expect(skill.name).toBe('daily-digest');
    expect(skill.version).toBe('1.0.0');
    expect(skill.tools).toHaveLength(4);
  });

  it('uses schedule trigger with cron', () => {
    const skill = createDailyDigestSkill(config);
    expect(skill.triggers).toHaveLength(1);
    expect(skill.triggers[0].type).toBe('schedule');
    expect(skill.triggers[0].cron).toBe('0 9 * * 1-5');
  });

  it('includes delivery channel in prompt', () => {
    const skill = createDailyDigestSkill(config);
    expect(skill.systemPrompt).toContain('slack');
  });

  it('includes sections in prompt', () => {
    const skill = createDailyDigestSkill(config);
    expect(skill.systemPrompt).toContain('activity');
    expect(skill.systemPrompt).toContain('deadlines');
  });

  it('has gather and deliver tools', () => {
    const skill = createDailyDigestSkill(config);
    const toolNames = skill.tools.map(t => t.name);
    expect(toolNames).toContain('gather_activity');
    expect(toolNames).toContain('gather_deadlines');
    expect(toolNames).toContain('deliver_digest');
  });
});
