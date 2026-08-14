export interface EmailAssistantConfig {
  inboxFilter?: string;
  autoDraft: boolean;
  priorityThreshold: 'all' | 'medium' | 'high';
}

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

export function createEmailAssistantSkill(config: EmailAssistantConfig): HermesSkillDefinition {
  return {
    name: 'email-assistant',
    version: '1.0.0',
    description: 'Categorize incoming emails, draft responses, and flag items needing human attention',

    systemPrompt: buildSystemPrompt(config),

    tools: [
      {
        name: 'classify_email',
        description: 'Classify an email by priority and category',
        parameters: {
          from: { type: 'string', description: 'Sender address', required: true },
          subject: { type: 'string', description: 'Email subject line', required: true },
          has_attachments: { type: 'boolean', description: 'Whether email has attachments' },
          is_reply: { type: 'boolean', description: 'Whether this is a reply' },
        },
      },
      {
        name: 'draft_response',
        description: 'Draft a response to an email',
        parameters: {
          email_id: { type: 'string', description: 'ID of the email to respond to', required: true },
          tone: { type: 'string', description: 'Response tone: professional, casual, brief' },
          key_points: { type: 'string', description: 'Key points to address in the response' },
        },
      },
      {
        name: 'flag_for_review',
        description: 'Flag an email for human review',
        parameters: {
          email_id: { type: 'string', description: 'ID of the email', required: true },
          reason: { type: 'string', description: 'Why this needs human attention', required: true },
        },
      },
    ],

    triggers: [
      {
        type: 'event',
        source: 'email-connector',
        event: 'email.received',
      },
    ],
  };
}

function buildSystemPrompt(config: EmailAssistantConfig): string {
  const lines = [
    'You are an email assistant for a small team.',
    'Your role is to classify incoming emails, draft responses when appropriate, and flag items that need human attention.',
    '',
    'Guidelines:',
    '- Never send emails automatically — only draft them for review',
    '- Flag anything ambiguous, sensitive, or requiring judgment',
    '- Be concise in drafts — match the sender\'s tone and length',
    '- Prioritize action-required emails over informational ones',
    '',
  ];

  if (config.priorityThreshold !== 'all') {
    lines.push(`Only process emails at ${config.priorityThreshold} priority or above.`);
  }

  if (config.autoDraft) {
    lines.push('Auto-draft responses for action-required and scheduling emails.');
  } else {
    lines.push('Do not auto-draft responses. Only classify and flag.');
  }

  if (config.inboxFilter) {
    lines.push(`Filter: only process emails matching "${config.inboxFilter}".`);
  }

  return lines.join('\n');
}
