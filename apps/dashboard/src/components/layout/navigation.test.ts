import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, MOBILE_NAV_ITEMS, getActiveNavItem, isDesktopOnly } from './navigation.js';

describe('NAV_ITEMS', () => {
  it('has 8 items', () => {
    expect(NAV_ITEMS).toHaveLength(8);
  });

  it('all have required fields', () => {
    for (const item of NAV_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.path).toMatch(/^\//);
      expect(item.icon).toBeTruthy();
      expect(['main', 'system']).toContain(item.section);
      expect(typeof item.mobileVisible).toBe('boolean');
    }
  });

  it('overview is first', () => {
    expect(NAV_ITEMS[0].id).toBe('overview');
  });

  it('has unique paths', () => {
    const paths = NAV_ITEMS.map(i => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has unique ids', () => {
    const ids = NAV_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('MOBILE_NAV_ITEMS', () => {
  it('has exactly 3 items (overview, activity, monitoring)', () => {
    expect(MOBILE_NAV_ITEMS).toHaveLength(3);
  });

  it('contains overview', () => {
    expect(MOBILE_NAV_ITEMS.find(i => i.id === 'overview')).toBeDefined();
  });

  it('contains activity', () => {
    expect(MOBILE_NAV_ITEMS.find(i => i.id === 'activity')).toBeDefined();
  });

  it('contains monitoring', () => {
    expect(MOBILE_NAV_ITEMS.find(i => i.id === 'monitoring')).toBeDefined();
  });

  it('does not contain integrations', () => {
    expect(MOBILE_NAV_ITEMS.find(i => i.id === 'integrations')).toBeUndefined();
  });
});

describe('getActiveNavItem', () => {
  it('matches exact path', () => {
    expect(getActiveNavItem('/overview')?.id).toBe('overview');
  });

  it('matches subpath', () => {
    expect(getActiveNavItem('/integrations/slack')?.id).toBe('integrations');
  });

  it('returns undefined for unknown path', () => {
    expect(getActiveNavItem('/settings')).toBeUndefined();
  });
});

describe('isDesktopOnly', () => {
  it('integrations is desktop only', () => {
    expect(isDesktopOnly('/integrations')).toBe(true);
  });

  it('workflows is desktop only', () => {
    expect(isDesktopOnly('/workflows')).toBe(true);
  });

  it('overview is NOT desktop only', () => {
    expect(isDesktopOnly('/overview')).toBe(false);
  });

  it('monitoring is NOT desktop only', () => {
    expect(isDesktopOnly('/monitoring')).toBe(false);
  });
});
