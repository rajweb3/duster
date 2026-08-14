import { describe, it, expect } from 'vitest';
import { classifyEmail, shouldNotify, filterByPriority, type EmailSignals } from './classifier.js';
import { createEmailAssistantSkill } from './skill-definition.js';

describe('email classifier', () => {
  const baseSignals: EmailSignals = {
    from: 'colleague@company.com',
    subject: 'Project update',
    hasAttachments: false,
    isReply: false,
    recipientCount: 1,
    timestamp: Date.now(),
  };

  describe('priority detection', () => {
    it('marks urgent subjects as urgent', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'URGENT: Server down' });
      expect(r.priority).toBe('urgent');
    });

    it('marks ASAP as urgent', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Need this ASAP' });
      expect(r.priority).toBe('urgent');
    });

    it('marks action_required as high', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Please review this PR' });
      expect(r.priority).toBe('high');
    });

    it('marks automated as low', () => {
      const r = classifyEmail({ ...baseSignals, from: 'noreply@github.com', subject: 'Notification: CI passed' });
      expect(r.priority).toBe('low');
    });

    it('marks sales emails as low', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Limited time promotion!' });
      expect(r.priority).toBe('low');
    });
  });

  describe('categorization', () => {
    it('detects automated emails', () => {
      const r = classifyEmail({ ...baseSignals, from: 'no-reply@service.com', subject: 'Your notification' });
      expect(r.category).toBe('automated');
    });

    it('detects sales emails', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Free trial expiring' });
      expect(r.category).toBe('sales');
    });

    it('detects scheduling emails', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Meeting invite: Weekly sync' });
      expect(r.category).toBe('scheduling');
    });

    it('detects action required', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Action required: approve budget' });
      expect(r.category).toBe('action_required');
    });

    it('detects FYI emails', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'FYI: New policy update' });
      expect(r.category).toBe('fyi');
    });

    it('defaults to personal', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Hey, quick question' });
      expect(r.category).toBe('personal');
    });
  });

  describe('draft decision', () => {
    it('drafts for urgent emails', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Urgent: Need approval' });
      expect(r.shouldDraft).toBe(true);
    });

    it('drafts for scheduling', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Meeting invite: standup' });
      expect(r.shouldDraft).toBe(true);
    });

    it('does not draft for automated', () => {
      const r = classifyEmail({ ...baseSignals, from: 'noreply@x.com', subject: 'Automated report' });
      expect(r.shouldDraft).toBe(false);
    });

    it('does not draft for FYI', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'FYI: team lunch moved' });
      expect(r.shouldDraft).toBe(false);
    });

    it('does not draft for sales', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Limited time offer!' });
      expect(r.shouldDraft).toBe(false);
    });
  });

  describe('shouldNotify', () => {
    it('notifies for urgent', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'URGENT fix needed' });
      expect(shouldNotify(r)).toBe(true);
    });

    it('notifies for high priority', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Please approve this' });
      expect(shouldNotify(r)).toBe(true);
    });

    it('does not notify for medium', () => {
      const r = classifyEmail({ ...baseSignals, subject: 'Quick question' });
      expect(shouldNotify(r)).toBe(false);
    });
  });

  describe('filterByPriority', () => {
    const classifications = [
      classifyEmail({ ...baseSignals, subject: 'Urgent thing' }),
      classifyEmail({ ...baseSignals, subject: 'Review this PR' }),
      classifyEmail({ ...baseSignals, subject: 'Quick question' }),
      classifyEmail({ ...baseSignals, from: 'noreply@x.com', subject: 'Automated alert' }),
    ];

    it('all returns everything', () => {
      expect(filterByPriority(classifications, 'all')).toHaveLength(4);
    });

    it('high returns urgent and high only', () => {
      const filtered = filterByPriority(classifications, 'high');
      expect(filtered.every(c => c.priority === 'urgent' || c.priority === 'high')).toBe(true);
    });

    it('medium includes medium and above', () => {
      const filtered = filterByPriority(classifications, 'medium');
      expect(filtered.every(c => c.priority !== 'low')).toBe(true);
    });
  });
});

describe('email assistant skill definition', () => {
  it('creates valid skill definition', () => {
    const skill = createEmailAssistantSkill({
      autoDraft: true,
      priorityThreshold: 'medium',
    });

    expect(skill.name).toBe('email-assistant');
    expect(skill.version).toBe('1.0.0');
    expect(skill.tools).toHaveLength(3);
    expect(skill.triggers).toHaveLength(1);
    expect(skill.triggers[0].type).toBe('event');
    expect(skill.triggers[0].event).toBe('email.received');
  });

  it('includes priority filter in prompt', () => {
    const skill = createEmailAssistantSkill({
      autoDraft: false,
      priorityThreshold: 'high',
    });
    expect(skill.systemPrompt).toContain('high priority');
  });

  it('includes inbox filter in prompt', () => {
    const skill = createEmailAssistantSkill({
      autoDraft: true,
      priorityThreshold: 'all',
      inboxFilter: 'team@company.com',
    });
    expect(skill.systemPrompt).toContain('team@company.com');
  });

  it('tools have required parameters marked', () => {
    const skill = createEmailAssistantSkill({ autoDraft: true, priorityThreshold: 'all' });
    const classifyTool = skill.tools.find(t => t.name === 'classify_email');
    expect(classifyTool?.parameters.from.required).toBe(true);
    expect(classifyTool?.parameters.subject.required).toBe(true);
  });
});
