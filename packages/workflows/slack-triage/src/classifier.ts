import type { SlackMessage, TriageResult, RoutingRule, RuleCondition } from './types.js';

export function classifyMessage(
  message: SlackMessage,
  rules: RoutingRule[],
  urgencyKeywords: string[],
): TriageResult {
  const matchedRule = findMatchingRule(message, rules);
  const detectedPriority = detectPriority(message.content, urgencyKeywords);
  const category = categorizeContent(message.content);

  return {
    messageId: message.id,
    category,
    priority: matchedRule?.priority || detectedPriority,
    routedTo: matchedRule?.targetChannel || null,
    summary: generateSummary(message.content),
    suggestedAction: matchedRule?.autoLabel ? `label:${matchedRule.autoLabel}` : undefined,
    confidence: matchedRule ? 0.9 : 0.6,
  };
}

function findMatchingRule(message: SlackMessage, rules: RoutingRule[]): RoutingRule | null {
  for (const rule of rules) {
    if (rule.conditions.every(cond => evaluateCondition(message, cond))) {
      return rule;
    }
  }
  return null;
}

function evaluateCondition(message: SlackMessage, condition: RuleCondition): boolean {
  let fieldValue: string;

  switch (condition.field) {
    case 'content':
      fieldValue = message.content;
      break;
    case 'author':
      fieldValue = message.author;
      break;
    case 'channel':
      fieldValue = message.channel;
      break;
    case 'time':
      fieldValue = new Date(message.timestamp).toISOString();
      break;
    default:
      return false;
  }

  switch (condition.operator) {
    case 'contains':
      return fieldValue.toLowerCase().includes(condition.value.toLowerCase());
    case 'equals':
      return fieldValue.toLowerCase() === condition.value.toLowerCase();
    case 'matches':
      try {
        return new RegExp(condition.value, 'i').test(fieldValue);
      } catch {
        return false;
      }
    case 'before':
    case 'after':
      if (condition.field !== 'time') return false;
      const msgTime = message.timestamp;
      const condTime = new Date(condition.value).getTime();
      return condition.operator === 'before' ? msgTime < condTime : msgTime > condTime;
    default:
      return false;
  }
}

function detectPriority(content: string, urgencyKeywords: string[]): 'low' | 'medium' | 'high' | 'urgent' {
  const lower = content.toLowerCase();

  for (const keyword of urgencyKeywords) {
    if (lower.includes(keyword.toLowerCase())) {
      return 'urgent';
    }
  }

  if (lower.includes('asap') || lower.includes('urgent') || lower.includes('emergency')) {
    return 'urgent';
  }
  if (lower.includes('important') || lower.includes('blocking') || lower.includes('critical')) {
    return 'high';
  }
  if (lower.includes('when you get a chance') || lower.includes('no rush') || lower.includes('fyi')) {
    return 'low';
  }

  return 'medium';
}

function categorizeContent(content: string): string {
  const lower = content.toLowerCase();

  if (lower.includes('deploy') || lower.includes('release') || lower.includes('ship')) {
    return 'deployment';
  }
  if (lower.includes('bug') || lower.includes('error') || lower.includes('broken') || lower.includes('fix')) {
    return 'bug_report';
  }
  if (lower.includes('feature request') || lower.includes('would be nice')) {
    return 'feature_request';
  }
  if (lower.includes('question') || lower.includes('how do') || lower.includes('?')) {
    return 'question';
  }
  if (lower.includes('meeting') || lower.includes('schedule') || lower.includes('call')) {
    return 'scheduling';
  }

  return 'general';
}

function generateSummary(content: string): string {
  const maxLen = 120;
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen - 3) + '...';
}
