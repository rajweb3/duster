import { describe, it, expect } from 'vitest';
import {
  getStatusColor,
  getStatusSize,
  mapTenantStatus,
  mapConnectorStatus,
  mapWorkflowStatus,
  getStatusLabel,
} from './status-dot.js';

describe('getStatusColor', () => {
  it('healthy is green', () => expect(getStatusColor('healthy')).toBe('#22c55e'));
  it('degraded is yellow', () => expect(getStatusColor('degraded')).toBe('#eab308'));
  it('error is red', () => expect(getStatusColor('error')).toBe('#ef4444'));
  it('connected is green', () => expect(getStatusColor('connected')).toBe('#22c55e'));
  it('disconnected is red', () => expect(getStatusColor('disconnected')).toBe('#ef4444'));
  it('active is green', () => expect(getStatusColor('active')).toBe('#22c55e'));
  it('paused is yellow', () => expect(getStatusColor('paused')).toBe('#eab308'));
  it('stopped is gray', () => expect(getStatusColor('stopped')).toBe('#555555'));
  it('offline is gray', () => expect(getStatusColor('offline')).toBe('#555555'));
});

describe('getStatusSize', () => {
  it('sm is 8', () => expect(getStatusSize('sm')).toBe(8));
  it('md is 10', () => expect(getStatusSize('md')).toBe(10));
  it('lg is 12', () => expect(getStatusSize('lg')).toBe(12));
  it('default is md', () => expect(getStatusSize()).toBe(10));
});

describe('mapTenantStatus', () => {
  it('maps healthy', () => expect(mapTenantStatus('healthy')).toBe('healthy'));
  it('maps degraded', () => expect(mapTenantStatus('degraded')).toBe('degraded'));
  it('maps error', () => expect(mapTenantStatus('error')).toBe('error'));
});

describe('mapConnectorStatus', () => {
  it('maps connected', () => expect(mapConnectorStatus('connected')).toBe('connected'));
  it('maps disconnected', () => expect(mapConnectorStatus('disconnected')).toBe('disconnected'));
  it('maps error', () => expect(mapConnectorStatus('error')).toBe('error'));
});

describe('mapWorkflowStatus', () => {
  it('maps active', () => expect(mapWorkflowStatus('active')).toBe('active'));
  it('maps paused', () => expect(mapWorkflowStatus('paused')).toBe('paused'));
  it('maps error', () => expect(mapWorkflowStatus('error')).toBe('error'));
  it('maps stopped', () => expect(mapWorkflowStatus('stopped')).toBe('stopped'));
});

describe('getStatusLabel', () => {
  it('capitalizes healthy', () => expect(getStatusLabel('healthy')).toBe('Healthy'));
  it('capitalizes disconnected', () => expect(getStatusLabel('disconnected')).toBe('Disconnected'));
});
