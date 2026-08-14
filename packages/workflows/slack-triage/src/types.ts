export interface SlackTriageConfig {
  sourceChannels: string[];
  routingRules: RoutingRule[];
  summaryChannel?: string;
  digestSchedule?: string;
  urgencyKeywords: string[];
  autoReply: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  targetChannel: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  autoLabel?: string;
}

export interface RuleCondition {
  field: 'content' | 'author' | 'channel' | 'time';
  operator: 'contains' | 'equals' | 'matches' | 'before' | 'after';
  value: string;
}

export interface SlackMessage {
  id: string;
  channel: string;
  author: string;
  content: string;
  timestamp: number;
  threadTs?: string;
}

export interface TriageResult {
  messageId: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  routedTo: string | null;
  summary: string;
  suggestedAction?: string;
  confidence: number;
}

export interface TriageSession {
  sessionId: string;
  startedAt: number;
  messagesProcessed: number;
  results: TriageResult[];
  errors: string[];
}
