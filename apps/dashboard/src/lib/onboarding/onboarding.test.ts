import { describe, it, expect } from 'vitest';
import {
  createInitialOnboardingState,
  getStepIndex,
  getNextStep,
  getPreviousStep,
  canAdvance,
  isComplete,
  applyProvisionResult,
  applyConnectResult,
  applyActivateResult,
  applyError,
  advanceStep,
  goBackStep,
  validateProvisionInput,
  validateConnectInput,
  validateActivateInput,
} from './wizard.js';

describe('onboarding wizard', () => {
  describe('initial state', () => {
    it('starts at provision step', () => {
      const state = createInitialOnboardingState();
      expect(state.currentStep).toBe('provision');
      expect(state.connectorConfigured).toBe(false);
      expect(state.workflowActivated).toBe(false);
    });
  });

  describe('step navigation', () => {
    it('getStepIndex returns correct indices', () => {
      expect(getStepIndex('provision')).toBe(0);
      expect(getStepIndex('connect')).toBe(1);
      expect(getStepIndex('activate')).toBe(2);
    });

    it('getNextStep returns next step', () => {
      expect(getNextStep('provision')).toBe('connect');
      expect(getNextStep('connect')).toBe('activate');
      expect(getNextStep('activate')).toBeNull();
    });

    it('getPreviousStep returns previous step', () => {
      expect(getPreviousStep('provision')).toBeNull();
      expect(getPreviousStep('connect')).toBe('provision');
      expect(getPreviousStep('activate')).toBe('connect');
    });
  });

  describe('canAdvance', () => {
    it('provision step requires tenantId and instanceId', () => {
      const state = createInitialOnboardingState();
      expect(canAdvance(state)).toBe(false);

      const withTenant = applyProvisionResult(state, 'tenant-1', 'i-abc');
      expect(canAdvance(withTenant)).toBe(true);
    });

    it('connect step requires connectorConfigured', () => {
      let state = createInitialOnboardingState();
      state = applyProvisionResult(state, 'tenant-1', 'i-abc');
      state = advanceStep(state);
      expect(state.currentStep).toBe('connect');
      expect(canAdvance(state)).toBe(false);

      state = applyConnectResult(state, 'slack');
      expect(canAdvance(state)).toBe(true);
    });

    it('activate step requires workflowActivated', () => {
      let state = createInitialOnboardingState();
      state = applyProvisionResult(state, 'tenant-1', 'i-abc');
      state = advanceStep(state);
      state = applyConnectResult(state, 'slack');
      state = advanceStep(state);
      expect(state.currentStep).toBe('activate');
      expect(canAdvance(state)).toBe(false);

      state = applyActivateResult(state, 'slack-triage');
      expect(canAdvance(state)).toBe(true);
    });
  });

  describe('state transitions', () => {
    it('full flow: provision → connect → activate', () => {
      let state = createInitialOnboardingState();

      state = applyProvisionResult(state, 'tenant-1', 'i-123');
      expect(state.tenantId).toBe('tenant-1');
      expect(state.instanceId).toBe('i-123');

      state = advanceStep(state);
      expect(state.currentStep).toBe('connect');

      state = applyConnectResult(state, 'slack');
      expect(state.connectorType).toBe('slack');
      expect(state.connectorConfigured).toBe(true);

      state = advanceStep(state);
      expect(state.currentStep).toBe('activate');

      state = applyActivateResult(state, 'slack-triage');
      expect(state.workflowId).toBe('slack-triage');
      expect(state.workflowActivated).toBe(true);
      expect(state.completedAt).toBeGreaterThan(0);
      expect(isComplete(state)).toBe(true);
    });

    it('advanceStep does nothing if cannot advance', () => {
      const state = createInitialOnboardingState();
      const next = advanceStep(state);
      expect(next.currentStep).toBe('provision');
    });

    it('goBackStep moves to previous step', () => {
      let state = createInitialOnboardingState();
      state = applyProvisionResult(state, 't', 'i');
      state = advanceStep(state);
      expect(state.currentStep).toBe('connect');

      state = goBackStep(state);
      expect(state.currentStep).toBe('provision');
    });

    it('goBackStep does nothing on first step', () => {
      const state = createInitialOnboardingState();
      expect(goBackStep(state).currentStep).toBe('provision');
    });

    it('applyError sets error and preserves state', () => {
      const state = createInitialOnboardingState();
      const withError = applyError(state, 'Provisioning failed');
      expect(withError.error).toBe('Provisioning failed');
      expect(withError.currentStep).toBe('provision');
    });

    it('successful apply clears error', () => {
      let state = applyError(createInitialOnboardingState(), 'some error');
      state = applyProvisionResult(state, 't', 'i');
      expect(state.error).toBeUndefined();
    });
  });

  describe('validation', () => {
    describe('validateProvisionInput', () => {
      it('accepts valid input', () => {
        expect(validateProvisionInput({ teamName: 'My Team', plan: 'standard' })).toBeNull();
      });

      it('rejects short team name', () => {
        expect(validateProvisionInput({ teamName: 'A', plan: 'standard' })).toContain('2 characters');
      });

      it('rejects long team name', () => {
        expect(validateProvisionInput({ teamName: 'x'.repeat(65), plan: 'standard' })).toContain('64');
      });

      it('rejects empty team name', () => {
        expect(validateProvisionInput({ teamName: '', plan: 'standard' })).toBeTruthy();
      });

      it('rejects invalid plan', () => {
        expect(validateProvisionInput({ teamName: 'Team', plan: 'enterprise' as any })).toContain('standard');
      });
    });

    describe('validateConnectInput', () => {
      it('accepts valid slack config', () => {
        expect(validateConnectInput({ connectorType: 'slack', webhookUrl: 'https://hooks.slack.com/x' })).toBeNull();
      });

      it('accepts valid email config', () => {
        expect(validateConnectInput({ connectorType: 'email', apiToken: 'tok-123' })).toBeNull();
      });

      it('accepts valid trello config', () => {
        expect(validateConnectInput({ connectorType: 'trello' })).toBeNull();
      });

      it('rejects invalid connector type', () => {
        expect(validateConnectInput({ connectorType: 'github' as any })).toContain('Connector type');
      });

      it('rejects slack without webhook', () => {
        expect(validateConnectInput({ connectorType: 'slack' })).toContain('webhook');
      });

      it('rejects email without token', () => {
        expect(validateConnectInput({ connectorType: 'email' })).toContain('API token');
      });
    });

    describe('validateActivateInput', () => {
      it('accepts valid workflow id', () => {
        expect(validateActivateInput({ workflowId: 'slack-triage', config: {} })).toBeNull();
      });

      it('rejects empty workflow id', () => {
        expect(validateActivateInput({ workflowId: '', config: {} })).toContain('required');
      });

      it('rejects whitespace-only workflow id', () => {
        expect(validateActivateInput({ workflowId: '   ', config: {} })).toContain('required');
      });
    });
  });
});
