export type DigestSection = 'activity' | 'deadlines' | 'metrics' | 'action_items';

export interface DigestConfig {
  schedule: string;
  deliveryChannel: 'slack' | 'email';
  sections: DigestSection[];
}

export interface ActivitySummary {
  totalMessages: number;
  channelsActive: number;
  topChannels: { name: string; count: number }[];
  period: { start: number; end: number };
}

export interface DeadlineItem {
  title: string;
  dueDate: number;
  assignee?: string;
  source: string;
  isOverdue: boolean;
}

export interface MetricSnapshot {
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  previousValue: number;
}

export interface ActionItem {
  description: string;
  source: string;
  assignee?: string;
  createdAt: number;
  priority: 'high' | 'medium' | 'low';
}

export interface DigestContent {
  generatedAt: number;
  sections: {
    activity?: ActivitySummary;
    deadlines?: DeadlineItem[];
    metrics?: MetricSnapshot[];
    actionItems?: ActionItem[];
  };
}

export function buildDigestContent(
  config: DigestConfig,
  data: {
    activity?: ActivitySummary;
    deadlines?: DeadlineItem[];
    metrics?: MetricSnapshot[];
    actionItems?: ActionItem[];
  },
): DigestContent {
  const sections: DigestContent['sections'] = {};

  if (config.sections.includes('activity') && data.activity) {
    sections.activity = data.activity;
  }
  if (config.sections.includes('deadlines') && data.deadlines) {
    sections.deadlines = sortDeadlines(data.deadlines);
  }
  if (config.sections.includes('metrics') && data.metrics) {
    sections.metrics = data.metrics;
  }
  if (config.sections.includes('action_items') && data.actionItems) {
    sections.actionItems = sortActionItems(data.actionItems);
  }

  return { generatedAt: Date.now(), sections };
}

function sortDeadlines(deadlines: DeadlineItem[]): DeadlineItem[] {
  return [...deadlines].sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.dueDate - b.dueDate;
  });
}

function sortActionItems(items: ActionItem[]): ActionItem[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return [...items].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

export function formatDigestMarkdown(content: DigestContent): string {
  const lines: string[] = ['# Daily Digest', ''];

  if (content.sections.activity) {
    const a = content.sections.activity;
    lines.push('## Activity Summary');
    lines.push(`- **${a.totalMessages}** messages across **${a.channelsActive}** channels`);
    if (a.topChannels.length > 0) {
      lines.push('- Top channels: ' + a.topChannels.map(c => `${c.name} (${c.count})`).join(', '));
    }
    lines.push('');
  }

  if (content.sections.deadlines && content.sections.deadlines.length > 0) {
    lines.push('## Upcoming Deadlines');
    for (const d of content.sections.deadlines) {
      const overdue = d.isOverdue ? ' ⚠️ OVERDUE' : '';
      const assignee = d.assignee ? ` (${d.assignee})` : '';
      lines.push(`- ${d.title}${assignee}${overdue}`);
    }
    lines.push('');
  }

  if (content.sections.metrics && content.sections.metrics.length > 0) {
    lines.push('## Metrics');
    for (const m of content.sections.metrics) {
      const arrow = m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→';
      lines.push(`- ${m.name}: ${m.value}${m.unit} ${arrow}`);
    }
    lines.push('');
  }

  if (content.sections.actionItems && content.sections.actionItems.length > 0) {
    lines.push('## Action Items');
    for (const item of content.sections.actionItems) {
      const assignee = item.assignee ? ` @${item.assignee}` : '';
      lines.push(`- [${item.priority.toUpperCase()}] ${item.description}${assignee}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function validateCronExpression(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const ranges = [
    { min: 0, max: 59 },
    { min: 0, max: 23 },
    { min: 1, max: 31 },
    { min: 1, max: 12 },
    { min: 0, max: 7 },
  ];
  for (let i = 0; i < 5; i++) {
    if (!isValidCronField(parts[i], ranges[i].min, ranges[i].max)) return false;
  }
  return true;
}

function isValidCronField(field: string, min: number, max: number): boolean {
  if (field === '*') return true;
  const rangePattern = /^(\d+)-(\d+)$/;
  const listParts = field.split(',');
  for (const part of listParts) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const base = stepMatch ? stepMatch[1] : part;
    if (base === '*') continue;
    const rangeMatch = base.match(rangePattern);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      if (start < min || end > max || start > end) return false;
    } else {
      const num = parseInt(base);
      if (isNaN(num) || num < min || num > max) return false;
    }
  }
  return true;
}
