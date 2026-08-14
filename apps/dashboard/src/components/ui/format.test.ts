import { describe, it, expect } from 'vitest';
import {
  formatUptime,
  formatBytes,
  formatTokensPerMinute,
  formatPercent,
  formatTimestamp,
  formatRelativeTime,
  formatInferenceSpeed,
} from './format.js';

describe('formatUptime', () => {
  it('formats seconds', () => expect(formatUptime(45)).toBe('45s'));
  it('formats minutes', () => expect(formatUptime(125)).toBe('2m'));
  it('formats hours and minutes', () => expect(formatUptime(7800)).toBe('2h 10m'));
  it('formats days and hours', () => expect(formatUptime(90000)).toBe('1d 1h'));
});

describe('formatBytes', () => {
  it('formats MB', () => expect(formatBytes(500)).toBe('500 MB'));
  it('formats GB', () => expect(formatBytes(2048)).toBe('2.0 GB'));
  it('formats large MB', () => expect(formatBytes(18200)).toBe('17.8 GB'));
});

describe('formatTokensPerMinute', () => {
  it('formats zero', () => expect(formatTokensPerMinute(0)).toBe('0'));
  it('formats small values', () => expect(formatTokensPerMinute(12.5)).toBe('12.5'));
  it('formats large values', () => expect(formatTokensPerMinute(1500)).toBe('1500'));
});

describe('formatPercent', () => {
  it('formats with one decimal', () => expect(formatPercent(85.3)).toBe('85.3%'));
  it('formats zero', () => expect(formatPercent(0)).toBe('0.0%'));
});

describe('formatTimestamp', () => {
  it('returns Never for 0', () => expect(formatTimestamp(0)).toBe('Never'));
  it('returns time string for valid timestamp', () => {
    const result = formatTimestamp(Date.now());
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

describe('formatRelativeTime', () => {
  it('returns Never for 0', () => expect(formatRelativeTime(0)).toBe('Never'));
  it('returns Just now for recent', () => expect(formatRelativeTime(Date.now() - 500)).toBe('Just now'));
  it('returns seconds ago', () => expect(formatRelativeTime(Date.now() - 30000)).toBe('30s ago'));
  it('returns minutes ago', () => expect(formatRelativeTime(Date.now() - 300000)).toBe('5m ago'));
  it('returns hours ago', () => expect(formatRelativeTime(Date.now() - 7200000)).toBe('2h ago'));
  it('returns days ago', () => expect(formatRelativeTime(Date.now() - 172800000)).toBe('2d ago'));
});

describe('formatInferenceSpeed', () => {
  it('returns dash for zero', () => expect(formatInferenceSpeed(0)).toBe('—'));
  it('formats speed', () => expect(formatInferenceSpeed(45.2)).toBe('45.2 tok/s'));
});
