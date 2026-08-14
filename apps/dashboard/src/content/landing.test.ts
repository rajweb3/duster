import { describe, it, expect } from 'vitest';
import { getLandingPageData, getMetaTags } from './landing.js';

describe('landing page data', () => {
  const data = getLandingPageData();

  describe('hero', () => {
    it('has headline and subheadline', () => {
      expect(data.hero.headline).toBeTruthy();
      expect(data.hero.subheadline.length).toBeGreaterThan(50);
    });

    it('has CTA links', () => {
      expect(data.hero.cta.href).toBe('/signup');
      expect(data.hero.secondaryCta.href).toBe('#how-it-works');
    });

    it('mentions zero-knowledge in hero', () => {
      const combined = data.hero.headline + data.hero.subheadline;
      expect(combined.toLowerCase()).toContain('zero');
    });
  });

  describe('features', () => {
    it('has 6 features', () => {
      expect(data.features).toHaveLength(6);
    });

    it('each feature has required fields', () => {
      for (const f of data.features) {
        expect(f.title).toBeTruthy();
        expect(f.description.length).toBeGreaterThan(30);
        expect(f.icon).toBeTruthy();
      }
    });

    it('covers key selling points', () => {
      const titles = data.features.map(f => f.title.toLowerCase());
      expect(titles.some(t => t.includes('zero-knowledge'))).toBe(true);
      expect(titles.some(t => t.includes('gpu'))).toBe(true);
      expect(titles.some(t => t.includes('workflow'))).toBe(true);
      expect(titles.some(t => t.includes('monitoring'))).toBe(true);
      expect(titles.some(t => t.includes('recovery'))).toBe(true);
    });
  });

  describe('how it works', () => {
    it('has 3 steps', () => {
      expect(data.howItWorks.steps).toHaveLength(3);
    });

    it('steps are numbered 1-3', () => {
      expect(data.howItWorks.steps.map(s => s.step)).toEqual([1, 2, 3]);
    });

    it('steps match onboarding flow: provision → connect → activate', () => {
      const titles = data.howItWorks.steps.map(s => s.title.toLowerCase());
      expect(titles[0]).toContain('provision');
      expect(titles[1]).toContain('connect');
      expect(titles[2]).toContain('activate');
    });
  });

  describe('pricing', () => {
    it('shows $499/month', () => {
      expect(data.pricing.price).toBe('$499');
      expect(data.pricing.period).toBe('/month');
    });

    it('has 7+ features listed', () => {
      expect(data.pricing.features.length).toBeGreaterThanOrEqual(7);
    });

    it('includes money-back guarantee', () => {
      expect(data.pricing.note.toLowerCase()).toContain('money-back');
    });

    it('CTA links to signup', () => {
      expect(data.pricing.cta.href).toBe('/signup');
    });
  });

  describe('faq', () => {
    it('has 6 questions', () => {
      expect(data.faq).toHaveLength(6);
    });

    it('each item has question and answer', () => {
      for (const item of data.faq) {
        expect(item.question.endsWith('?')).toBe(true);
        expect(item.answer.length).toBeGreaterThan(50);
      }
    });

    it('covers zero-knowledge explanation', () => {
      const zkFaq = data.faq.find(f => f.question.toLowerCase().includes('zero-knowledge'));
      expect(zkFaq).toBeDefined();
      expect(zkFaq!.answer).toContain('metadata');
    });

    it('covers model information', () => {
      const modelFaq = data.faq.find(f => f.question.toLowerCase().includes('model'));
      expect(modelFaq).toBeDefined();
      expect(modelFaq!.answer).toContain('Muse Glimmer');
    });
  });

  describe('footer', () => {
    it('has copyright with year', () => {
      expect(data.footer.copyright).toContain('Duster');
      expect(data.footer.copyright).toMatch(/\d{4}/);
    });

    it('has essential links', () => {
      const labels = data.footer.links.map(l => l.label);
      expect(labels).toContain('Privacy');
      expect(labels).toContain('Terms');
    });
  });
});

describe('meta tags', () => {
  const meta = getMetaTags();

  it('has title with brand', () => {
    expect(meta.title).toContain('Duster');
  });

  it('has description under 160 chars', () => {
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it('has og image', () => {
    expect(meta.ogImage).toBeTruthy();
  });
});
