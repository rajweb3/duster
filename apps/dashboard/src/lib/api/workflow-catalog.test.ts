import { describe, it, expect } from 'vitest';
import { WORKFLOW_CATALOG, getWorkflowById, getWorkflowsByCategory, getCategories } from './workflow-catalog.js';

describe('WORKFLOW_CATALOG', () => {
  it('has 5 workflows', () => {
    expect(WORKFLOW_CATALOG).toHaveLength(5);
  });

  it('all workflows have required fields', () => {
    for (const w of WORKFLOW_CATALOG) {
      expect(w.id).toBeTruthy();
      expect(w.name).toBeTruthy();
      expect(w.description.length).toBeGreaterThan(20);
      expect(['communication', 'productivity', 'operations']).toContain(w.category);
      expect(w.configFields.length).toBeGreaterThan(0);
    }
  });

  it('all config fields have required properties', () => {
    for (const w of WORKFLOW_CATALOG) {
      for (const field of w.configFields) {
        expect(field.key).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(['text', 'select', 'multiselect', 'toggle', 'cron']).toContain(field.type);
        expect(typeof field.required).toBe('boolean');
      }
    }
  });

  it('select fields have options', () => {
    for (const w of WORKFLOW_CATALOG) {
      for (const field of w.configFields) {
        if (field.type === 'select') {
          expect(field.options).toBeDefined();
          expect(field.options!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('slack-triage requires slack connector', () => {
    const w = WORKFLOW_CATALOG.find(w => w.id === 'slack-triage');
    expect(w?.requiredConnector).toBe('slack');
  });

  it('daily-digest has no required connector', () => {
    const w = WORKFLOW_CATALOG.find(w => w.id === 'daily-digest');
    expect(w?.requiredConnector).toBeUndefined();
  });
});

describe('getWorkflowById', () => {
  it('finds slack-triage', () => {
    const w = getWorkflowById('slack-triage');
    expect(w?.name).toBe('Slack Triage');
  });

  it('returns undefined for unknown', () => {
    expect(getWorkflowById('nonexistent')).toBeUndefined();
  });
});

describe('getWorkflowsByCategory', () => {
  it('returns communication workflows', () => {
    const ws = getWorkflowsByCategory('communication');
    expect(ws).toHaveLength(2);
    expect(ws.every(w => w.category === 'communication')).toBe(true);
  });

  it('returns productivity workflows', () => {
    const ws = getWorkflowsByCategory('productivity');
    expect(ws).toHaveLength(2);
  });

  it('returns operations workflows', () => {
    const ws = getWorkflowsByCategory('operations');
    expect(ws).toHaveLength(1);
  });

  it('returns empty for unknown category', () => {
    expect(getWorkflowsByCategory('unknown')).toHaveLength(0);
  });
});

describe('getCategories', () => {
  it('returns 3 unique categories', () => {
    const cats = getCategories();
    expect(cats).toHaveLength(3);
    expect(cats).toContain('communication');
    expect(cats).toContain('productivity');
    expect(cats).toContain('operations');
  });
});
