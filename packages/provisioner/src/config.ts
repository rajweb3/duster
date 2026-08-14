export interface ProvisionerConfig {
  awsRegion: string;
  amiId: string;
  instanceType: string;
  securityGroupId: string;
  subnetId: string;
  keyName: string;
  dashboardUrl: string;
  jwtSecret: string;
  iamInstanceProfile?: string;
  volumeSizeGb: number;
  dataVolumeSizeGb: number;
}

export function loadProvisionerConfig(env: Record<string, string | undefined> = process.env): ProvisionerConfig {
  const required = (key: string): string => {
    const val = env[key];
    if (!val) throw new Error(`${key} is required`);
    return val;
  };

  return {
    awsRegion: env.AWS_REGION || 'us-east-1',
    amiId: required('DUSTER_AMI_ID'),
    instanceType: env.DUSTER_INSTANCE_TYPE || 'g6.xlarge',
    securityGroupId: required('DUSTER_SECURITY_GROUP_ID'),
    subnetId: required('DUSTER_SUBNET_ID'),
    keyName: required('DUSTER_KEY_NAME'),
    dashboardUrl: required('DUSTER_DASHBOARD_URL'),
    jwtSecret: required('DUSTER_JWT_SECRET'),
    iamInstanceProfile: env.DUSTER_IAM_PROFILE,
    volumeSizeGb: parseInt(env.DUSTER_VOLUME_SIZE_GB || '100', 10),
    dataVolumeSizeGb: parseInt(env.DUSTER_DATA_VOLUME_SIZE_GB || '50', 10),
  };
}
