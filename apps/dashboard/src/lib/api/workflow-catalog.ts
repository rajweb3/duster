export interface CatalogWorkflow {
  id: string;
  name: string;
  description: string;
  category: 'communication' | 'productivity' | 'operations';
  icon: string;
  configFields: ConfigField[];
  requiredConnector?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'multiselect' | 'toggle' | 'cron';
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  defaultValue?: unknown;
}

export const WORKFLOW_CATALOG: CatalogWorkflow[] = [
  {
    id: 'slack-triage',
    name: 'Slack Triage',
    description: 'Automatically categorize and route incoming Slack messages based on content, urgency, and configurable rules.',
    category: 'communication',
    icon: 'message-square',
    requiredConnector: 'slack',
    configFields: [
      { key: 'sourceChannels', label: 'Source Channels', type: 'multiselect', required: true, placeholder: 'Select channels to monitor' },
      { key: 'urgencyKeywords', label: 'Urgency Keywords', type: 'text', required: false, placeholder: 'outage, down, p0, incident', defaultValue: 'outage, down, p0, incident, sev1' },
      { key: 'autoReply', label: 'Auto-reply to sender', type: 'toggle', required: false, defaultValue: false },
      { key: 'summaryChannel', label: 'Summary Channel', type: 'text', required: false, placeholder: 'Channel for daily digest' },
    ],
  },
  {
    id: 'email-assistant',
    name: 'Email Assistant',
    description: 'Draft responses to incoming emails, categorize by priority, and flag items needing human attention.',
    category: 'communication',
    icon: 'mail',
    requiredConnector: 'email',
    configFields: [
      { key: 'inboxFilter', label: 'Inbox Filter', type: 'text', required: false, placeholder: 'Filter by sender or subject' },
      { key: 'autoDraft', label: 'Auto-draft replies', type: 'toggle', required: false, defaultValue: true },
      { key: 'priorityThreshold', label: 'Priority Threshold', type: 'select', required: true, options: [
        { label: 'All emails', value: 'all' },
        { label: 'Medium and above', value: 'medium' },
        { label: 'High and urgent only', value: 'high' },
      ], defaultValue: 'all' },
    ],
  },
  {
    id: 'daily-digest',
    name: 'Daily Digest',
    description: 'Generate a daily summary of team activity, upcoming deadlines, and key metrics delivered at your preferred time.',
    category: 'productivity',
    icon: 'newspaper',
    configFields: [
      { key: 'schedule', label: 'Delivery Time', type: 'cron', required: true, placeholder: '0 9 * * 1-5', defaultValue: '0 9 * * 1-5' },
      { key: 'deliveryChannel', label: 'Delivery Channel', type: 'select', required: true, options: [
        { label: 'Slack', value: 'slack' },
        { label: 'Email', value: 'email' },
      ] },
      { key: 'includeSections', label: 'Sections', type: 'multiselect', required: true, options: [
        { label: 'Activity summary', value: 'activity' },
        { label: 'Upcoming deadlines', value: 'deadlines' },
        { label: 'Metrics', value: 'metrics' },
        { label: 'Action items', value: 'action_items' },
      ] },
    ],
  },
  {
    id: 'task-creator',
    name: 'Task Creator',
    description: 'Extract action items from conversations and automatically create tasks in your project management tool.',
    category: 'productivity',
    icon: 'check-square',
    requiredConnector: 'trello',
    configFields: [
      { key: 'sourceChannels', label: 'Monitor Channels', type: 'multiselect', required: true },
      { key: 'targetBoard', label: 'Target Board', type: 'text', required: true, placeholder: 'Board name or ID' },
      { key: 'autoAssign', label: 'Auto-assign based on mention', type: 'toggle', required: false, defaultValue: true },
    ],
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Summarize meeting transcripts, extract action items, and distribute notes to participants.',
    category: 'operations',
    icon: 'mic',
    configFields: [
      { key: 'distributionMethod', label: 'Distribute via', type: 'select', required: true, options: [
        { label: 'Slack', value: 'slack' },
        { label: 'Email', value: 'email' },
      ] },
      { key: 'extractActions', label: 'Extract action items', type: 'toggle', required: false, defaultValue: true },
      { key: 'summaryLength', label: 'Summary Length', type: 'select', required: false, options: [
        { label: 'Brief (1-2 paragraphs)', value: 'brief' },
        { label: 'Detailed (full summary)', value: 'detailed' },
      ], defaultValue: 'brief' },
    ],
  },
];

export function getWorkflowById(id: string): CatalogWorkflow | undefined {
  return WORKFLOW_CATALOG.find(w => w.id === id);
}

export function getWorkflowsByCategory(category: string): CatalogWorkflow[] {
  return WORKFLOW_CATALOG.filter(w => w.category === category);
}

export function getCategories(): string[] {
  return [...new Set(WORKFLOW_CATALOG.map(w => w.category))];
}
