import type {
  OnboardingState,
  OnboardingStep,
  ProvisionStepInput,
  ConnectStepInput,
  ActivateStepInput,
} from './types.js';

export function createInitialOnboardingState(): OnboardingState {
  return {
    currentStep: 'provision',
    connectorConfigured: false,
    workflowActivated: false,
  };
}

export function getStepIndex(step: OnboardingStep): number {
  const steps: OnboardingStep[] = ['provision', 'connect', 'activate'];
  return steps.indexOf(step);
}

export function getNextStep(current: OnboardingStep): OnboardingStep | null {
  const steps: OnboardingStep[] = ['provision', 'connect', 'activate'];
  const idx = steps.indexOf(current);
  if (idx === -1 || idx === steps.length - 1) return null;
  return steps[idx + 1];
}

export function getPreviousStep(current: OnboardingStep): OnboardingStep | null {
  const steps: OnboardingStep[] = ['provision', 'connect', 'activate'];
  const idx = steps.indexOf(current);
  if (idx <= 0) return null;
  return steps[idx - 1];
}

export function canAdvance(state: OnboardingState): boolean {
  switch (state.currentStep) {
    case 'provision':
      return !!state.tenantId && !!state.instanceId;
    case 'connect':
      return state.connectorConfigured;
    case 'activate':
      return state.workflowActivated;
    default:
      return false;
  }
}

export function isComplete(state: OnboardingState): boolean {
  return !!state.completedAt;
}

export function applyProvisionResult(
  state: OnboardingState,
  tenantId: string,
  instanceId: string,
): OnboardingState {
  return {
    ...state,
    tenantId,
    instanceId,
    error: undefined,
  };
}

export function applyConnectResult(
  state: OnboardingState,
  connectorType: string,
): OnboardingState {
  return {
    ...state,
    connectorType,
    connectorConfigured: true,
    error: undefined,
  };
}

export function applyActivateResult(
  state: OnboardingState,
  workflowId: string,
): OnboardingState {
  return {
    ...state,
    workflowId,
    workflowActivated: true,
    completedAt: Date.now(),
    error: undefined,
  };
}

export function applyError(state: OnboardingState, error: string): OnboardingState {
  return { ...state, error };
}

export function advanceStep(state: OnboardingState): OnboardingState {
  if (!canAdvance(state)) return state;
  const next = getNextStep(state.currentStep);
  if (!next) return state;
  return { ...state, currentStep: next, error: undefined };
}

export function goBackStep(state: OnboardingState): OnboardingState {
  const prev = getPreviousStep(state.currentStep);
  if (!prev) return state;
  return { ...state, currentStep: prev, error: undefined };
}

export function validateProvisionInput(input: ProvisionStepInput): string | null {
  if (!input.teamName || input.teamName.trim().length < 2) {
    return 'Team name must be at least 2 characters';
  }
  if (input.teamName.length > 64) {
    return 'Team name must be at most 64 characters';
  }
  if (input.plan !== 'standard') {
    return 'Only standard plan is available';
  }
  return null;
}

export function validateConnectInput(input: ConnectStepInput): string | null {
  const validTypes = ['slack', 'email', 'trello'];
  if (!validTypes.includes(input.connectorType)) {
    return `Connector type must be one of: ${validTypes.join(', ')}`;
  }
  if (input.connectorType === 'slack' && !input.webhookUrl) {
    return 'Slack connector requires a webhook URL';
  }
  if (input.connectorType === 'email' && !input.apiToken) {
    return 'Email connector requires an API token';
  }
  return null;
}

export function validateActivateInput(input: ActivateStepInput): string | null {
  if (!input.workflowId || input.workflowId.trim().length === 0) {
    return 'Workflow ID is required';
  }
  return null;
}
