export type OnboardingStep = 'provision' | 'connect' | 'activate';

export interface OnboardingState {
  currentStep: OnboardingStep;
  tenantId?: string;
  instanceId?: string;
  connectorType?: string;
  connectorConfigured: boolean;
  workflowId?: string;
  workflowActivated: boolean;
  completedAt?: number;
  error?: string;
}

export interface ProvisionStepInput {
  teamName: string;
  plan: 'standard';
}

export interface ConnectStepInput {
  connectorType: 'slack' | 'email' | 'trello';
  webhookUrl?: string;
  apiToken?: string;
}

export interface ActivateStepInput {
  workflowId: string;
  config: Record<string, unknown>;
}
