export enum ProvisioningErrorCode {
  CAPACITY_UNAVAILABLE = 'CAPACITY_UNAVAILABLE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  AMI_NOT_FOUND = 'AMI_NOT_FOUND',
  SECURITY_GROUP_INVALID = 'SECURITY_GROUP_INVALID',
  SUBNET_INVALID = 'SUBNET_INVALID',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export interface ProvisioningError {
  code: ProvisioningErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export function classifyAwsError(err: any): ProvisioningError {
  const code = err.Code || err.code || '';
  const message = err.message || err.Message || 'Unknown error';

  if (code === 'InsufficientInstanceCapacity' || code === 'InstanceLimitExceeded') {
    return {
      code: ProvisioningErrorCode.CAPACITY_UNAVAILABLE,
      message: `GPU capacity unavailable: ${message}`,
      retryable: true,
      retryAfterMs: 300000,
    };
  }

  if (code === 'VcpuLimitExceeded' || message.includes('quota')) {
    return {
      code: ProvisioningErrorCode.QUOTA_EXCEEDED,
      message: `AWS quota exceeded: ${message}`,
      retryable: false,
    };
  }

  if (code === 'InvalidAMIID.NotFound' || code === 'InvalidAMIID.Malformed') {
    return {
      code: ProvisioningErrorCode.AMI_NOT_FOUND,
      message: `AMI not found: ${message}`,
      retryable: false,
    };
  }

  if (code === 'InvalidGroup.NotFound') {
    return {
      code: ProvisioningErrorCode.SECURITY_GROUP_INVALID,
      message: `Security group invalid: ${message}`,
      retryable: false,
    };
  }

  if (code === 'InvalidSubnetID.NotFound') {
    return {
      code: ProvisioningErrorCode.SUBNET_INVALID,
      message: `Subnet invalid: ${message}`,
      retryable: false,
    };
  }

  if (message.includes('timeout') || message.includes('Timeout')) {
    return {
      code: ProvisioningErrorCode.TIMEOUT,
      message: `Operation timed out: ${message}`,
      retryable: true,
      retryAfterMs: 60000,
    };
  }

  return {
    code: ProvisioningErrorCode.UNKNOWN,
    message,
    retryable: true,
    retryAfterMs: 30000,
  };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  onError?: (err: ProvisioningError, attempt: number) => void,
  maxDelayMs?: number,
): Promise<T> {
  let lastError: ProvisioningError | null = null;
  const cap = maxDelayMs ?? 60000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = classifyAwsError(err);
      if (onError) onError(lastError, attempt);

      if (!lastError.retryable || attempt === maxRetries) {
        throw err;
      }

      const delay = lastError.retryAfterMs || 30000;
      await new Promise(resolve => setTimeout(resolve, Math.min(delay, cap)));
    }
  }

  throw new Error(lastError?.message || 'Max retries exceeded');
}
