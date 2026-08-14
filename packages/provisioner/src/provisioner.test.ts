import { describe, it, expect } from 'vitest';
import { loadProvisionerConfig } from './config.js';
import { generateUserData } from './user-data.js';
import { classifyAwsError, ProvisioningErrorCode, withRetry } from './error-handling.js';

describe('loadProvisionerConfig', () => {
  const baseEnv = {
    DUSTER_AMI_ID: 'ami-12345678',
    DUSTER_SECURITY_GROUP_ID: 'sg-abc123',
    DUSTER_SUBNET_ID: 'subnet-def456',
    DUSTER_KEY_NAME: 'duster-key',
    DUSTER_DASHBOARD_URL: 'wss://dashboard.duster.dev',
    DUSTER_JWT_SECRET: 'super-secret',
  };

  it('loads valid config', () => {
    const config = loadProvisionerConfig(baseEnv);
    expect(config.awsRegion).toBe('us-east-1');
    expect(config.amiId).toBe('ami-12345678');
    expect(config.instanceType).toBe('g6.xlarge');
    expect(config.volumeSizeGb).toBe(100);
    expect(config.dataVolumeSizeGb).toBe(50);
  });

  it('uses custom region', () => {
    const config = loadProvisionerConfig({ ...baseEnv, AWS_REGION: 'us-west-2' });
    expect(config.awsRegion).toBe('us-west-2');
  });

  it('uses custom instance type', () => {
    const config = loadProvisionerConfig({ ...baseEnv, DUSTER_INSTANCE_TYPE: 'g5.xlarge' });
    expect(config.instanceType).toBe('g5.xlarge');
  });

  it('throws on missing AMI_ID', () => {
    const { DUSTER_AMI_ID, ...env } = baseEnv;
    expect(() => loadProvisionerConfig(env)).toThrow('DUSTER_AMI_ID is required');
  });

  it('throws on missing SECURITY_GROUP_ID', () => {
    const { DUSTER_SECURITY_GROUP_ID, ...env } = baseEnv;
    expect(() => loadProvisionerConfig(env)).toThrow('DUSTER_SECURITY_GROUP_ID is required');
  });

  it('throws on missing SUBNET_ID', () => {
    const { DUSTER_SUBNET_ID, ...env } = baseEnv;
    expect(() => loadProvisionerConfig(env)).toThrow('DUSTER_SUBNET_ID is required');
  });

  it('throws on missing KEY_NAME', () => {
    const { DUSTER_KEY_NAME, ...env } = baseEnv;
    expect(() => loadProvisionerConfig(env)).toThrow('DUSTER_KEY_NAME is required');
  });

  it('throws on missing JWT_SECRET', () => {
    const { DUSTER_JWT_SECRET, ...env } = baseEnv;
    expect(() => loadProvisionerConfig(env)).toThrow('DUSTER_JWT_SECRET is required');
  });
});

describe('generateUserData', () => {
  it('returns base64 encoded script', () => {
    const userData = generateUserData({
      tenantId: 'tenant-123',
      dashboardUrl: 'wss://dashboard.duster.dev',
      jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    });

    const decoded = Buffer.from(userData, 'base64').toString('utf-8');
    expect(decoded).toContain('#!/bin/bash');
    expect(decoded).toContain('DUSTER_TENANT_ID=tenant-123');
    expect(decoded).toContain('DUSTER_DASHBOARD_URL=wss://dashboard.duster.dev');
    expect(decoded).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    expect(decoded).toContain('systemctl enable --now ollama');
    expect(decoded).toContain('systemctl enable --now hermes-agent');
    expect(decoded).toContain('systemctl enable --now duster-sidecar');
  });

  it('includes boot-complete signal', () => {
    const userData = generateUserData({
      tenantId: 't-1',
      dashboardUrl: 'wss://test',
      jwtToken: 'token',
    });
    const decoded = Buffer.from(userData, 'base64').toString('utf-8');
    expect(decoded).toContain('DUSTER_BOOT_COMPLETE');
  });
});

describe('classifyAwsError', () => {
  it('classifies capacity errors as retryable', () => {
    const err = { Code: 'InsufficientInstanceCapacity', message: 'No capacity' };
    const result = classifyAwsError(err);
    expect(result.code).toBe(ProvisioningErrorCode.CAPACITY_UNAVAILABLE);
    expect(result.retryable).toBe(true);
    expect(result.retryAfterMs).toBe(300000);
  });

  it('classifies quota errors as non-retryable', () => {
    const err = { Code: 'VcpuLimitExceeded', message: 'vCPU limit' };
    const result = classifyAwsError(err);
    expect(result.code).toBe(ProvisioningErrorCode.QUOTA_EXCEEDED);
    expect(result.retryable).toBe(false);
  });

  it('classifies AMI not found as non-retryable', () => {
    const err = { Code: 'InvalidAMIID.NotFound', message: 'AMI not found' };
    const result = classifyAwsError(err);
    expect(result.code).toBe(ProvisioningErrorCode.AMI_NOT_FOUND);
    expect(result.retryable).toBe(false);
  });

  it('classifies security group errors', () => {
    const err = { Code: 'InvalidGroup.NotFound', message: 'SG not found' };
    const result = classifyAwsError(err);
    expect(result.code).toBe(ProvisioningErrorCode.SECURITY_GROUP_INVALID);
    expect(result.retryable).toBe(false);
  });

  it('classifies subnet errors', () => {
    const err = { Code: 'InvalidSubnetID.NotFound', message: 'Subnet not found' };
    const result = classifyAwsError(err);
    expect(result.code).toBe(ProvisioningErrorCode.SUBNET_INVALID);
    expect(result.retryable).toBe(false);
  });

  it('classifies timeout errors as retryable', () => {
    const err = { message: 'Connection timeout' };
    const result = classifyAwsError(err);
    expect(result.code).toBe(ProvisioningErrorCode.TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it('classifies unknown errors as retryable', () => {
    const err = { message: 'Something unexpected' };
    const result = classifyAwsError(err);
    expect(result.code).toBe(ProvisioningErrorCode.UNKNOWN);
    expect(result.retryable).toBe(true);
  });
});

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    }, 3);
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on retryable error', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw { message: 'timeout', retryAfterMs: 10 };
      return 'ok';
    }, 3, undefined, 10);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws on non-retryable error', async () => {
    await expect(
      withRetry(async () => {
        throw { Code: 'VcpuLimitExceeded', message: 'quota' };
      }, 3),
    ).rejects.toMatchObject({ message: 'quota' });
  });

  it('throws after max retries', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw { message: 'timeout' };
      }, 2, undefined, 10),
    ).rejects.toBeDefined();
    expect(calls).toBe(2);
  });

  it('calls onError callback', async () => {
    const errors: any[] = [];
    try {
      await withRetry(
        async () => { throw { Code: 'InsufficientInstanceCapacity', message: 'no cap' }; },
        2,
        (err, attempt) => errors.push({ err, attempt }),
        10,
      );
    } catch {}
    expect(errors).toHaveLength(2);
    expect(errors[0].attempt).toBe(1);
    expect(errors[1].attempt).toBe(2);
  });
});
