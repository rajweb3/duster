export type EmailPriority = 'urgent' | 'high' | 'medium' | 'low';
export type EmailCategory = 'action_required' | 'fyi' | 'scheduling' | 'sales' | 'automated' | 'personal';

export interface EmailSignals {
  from: string;
  subject: string;
  hasAttachments: boolean;
  isReply: boolean;
  recipientCount: number;
  timestamp: number;
}

export interface EmailClassification {
  priority: EmailPriority;
  category: EmailCategory;
  shouldDraft: boolean;
  reason: string;
}

const URGENT_PATTERNS = [
  /urgent/i,
  /asap/i,
  /immediately/i,
  /critical/i,
  /emergency/i,
  /time.?sensitive/i,
];

const SCHEDULING_PATTERNS = [
  /meeting/i,
  /calendar/i,
  /schedule/i,
  /invite/i,
  /rsvp/i,
  /availability/i,
];

const SALES_PATTERNS = [
  /unsubscribe/i,
  /promotion/i,
  /limited.?time/i,
  /free trial/i,
  /demo request/i,
  /pricing/i,
];

const AUTOMATED_PATTERNS = [
  /no-?reply/i,
  /noreply/i,
  /automated/i,
  /notification/i,
  /alert from/i,
  /do not reply/i,
];

export function classifyEmail(signals: EmailSignals): EmailClassification {
  const category = categorize(signals);
  const priority = determinePriority(signals, category);
  const shouldDraft = determineShouldDraft(priority, category);
  const reason = buildReason(priority, category, signals);

  return { priority, category, shouldDraft, reason };
}

function categorize(signals: EmailSignals): EmailCategory {
  const { from, subject } = signals;
  const combined = `${from} ${subject}`;

  if (AUTOMATED_PATTERNS.some(p => p.test(combined))) return 'automated';
  if (SALES_PATTERNS.some(p => p.test(combined))) return 'sales';
  if (SCHEDULING_PATTERNS.some(p => p.test(subject))) return 'scheduling';

  if (/action|review|approve|sign|complete/i.test(subject)) return 'action_required';
  if (/fyi|info|update|announcement/i.test(subject)) return 'fyi';

  return 'personal';
}

function determinePriority(signals: EmailSignals, category: EmailCategory): EmailPriority {
  if (URGENT_PATTERNS.some(p => p.test(signals.subject))) return 'urgent';
  if (category === 'automated' || category === 'sales') return 'low';
  if (category === 'action_required') return 'high';
  if (category === 'scheduling') return 'medium';
  if (signals.isReply && signals.recipientCount <= 3) return 'medium';
  return 'medium';
}

function determineShouldDraft(priority: EmailPriority, category: EmailCategory): boolean {
  if (category === 'automated' || category === 'sales') return false;
  if (category === 'fyi') return false;
  if (priority === 'urgent' || priority === 'high') return true;
  if (category === 'scheduling') return true;
  if (category === 'personal') return true;
  return false;
}

function buildReason(priority: EmailPriority, category: EmailCategory, signals: EmailSignals): string {
  const parts: string[] = [];
  parts.push(`${priority} priority`);
  parts.push(`${category.replace('_', ' ')} email`);
  if (signals.hasAttachments) parts.push('has attachments');
  if (signals.isReply) parts.push('is a reply');
  return parts.join(', ');
}

export function shouldNotify(classification: EmailClassification): boolean {
  return classification.priority === 'urgent' || classification.priority === 'high';
}

export function filterByPriority(
  classifications: EmailClassification[],
  threshold: 'all' | 'medium' | 'high',
): EmailClassification[] {
  const priorityOrder: EmailPriority[] = ['urgent', 'high', 'medium', 'low'];
  const thresholdIdx = threshold === 'all' ? 3 : threshold === 'medium' ? 2 : 1;
  return classifications.filter(c => priorityOrder.indexOf(c.priority) <= thresholdIdx);
}
