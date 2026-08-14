import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
  waitUntilInstanceRunning,
  type RunInstancesCommandInput,
} from '@aws-sdk/client-ec2';
import { SignJWT } from 'jose';
import type { ProvisionerConfig } from './config.js';
import { generateUserData } from './user-data.js';

export interface TenantInstance {
  tenantId: string;
  instanceId: string;
  publicIp?: string;
  privateIp?: string;
  state: string;
  launchTime?: Date;
}

export interface ProvisionResult {
  success: boolean;
  instance?: TenantInstance;
  error?: string;
}

export class TenantProvisioner {
  private readonly ec2: EC2Client;
  private readonly config: ProvisionerConfig;

  constructor(config: ProvisionerConfig, ec2Client?: EC2Client) {
    this.config = config;
    this.ec2 = ec2Client || new EC2Client({ region: config.awsRegion });
  }

  async provision(tenantId: string, opts?: { tlsCert?: string; tlsKey?: string; tlsCa?: string }): Promise<ProvisionResult> {
    try {
      const jwtToken = await this.generateTenantToken(tenantId);
      const userData = generateUserData({
        tenantId,
        dashboardUrl: this.config.dashboardUrl,
        jwtToken,
        tlsCert: opts?.tlsCert,
        tlsKey: opts?.tlsKey,
        tlsCa: opts?.tlsCa,
      });

      const params: RunInstancesCommandInput = {
        ImageId: this.config.amiId,
        InstanceType: this.config.instanceType as any,
        MinCount: 1,
        MaxCount: 1,
        KeyName: this.config.keyName,
        SecurityGroupIds: [this.config.securityGroupId],
        SubnetId: this.config.subnetId,
        UserData: userData,
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              { Key: 'Name', Value: `duster-tenant-${tenantId.slice(0, 8)}` },
              { Key: 'duster:tenant-id', Value: tenantId },
              { Key: 'duster:managed', Value: 'true' },
              { Key: 'duster:version', Value: '0.1.0' },
            ],
          },
        ],
        BlockDeviceMappings: [
          {
            DeviceName: '/dev/sda1',
            Ebs: {
              VolumeSize: this.config.volumeSizeGb,
              VolumeType: 'gp3',
              DeleteOnTermination: true,
              Encrypted: true,
            },
          },
          {
            DeviceName: '/dev/sdf',
            Ebs: {
              VolumeSize: this.config.dataVolumeSizeGb,
              VolumeType: 'gp3',
              DeleteOnTermination: false,
              Encrypted: true,
            },
          },
        ],
        MetadataOptions: {
          HttpTokens: 'required',
          HttpPutResponseHopLimit: 1,
        },
      };

      if (this.config.iamInstanceProfile) {
        params.IamInstanceProfile = { Name: this.config.iamInstanceProfile };
      }

      const result = await this.ec2.send(new RunInstancesCommand(params));
      const instance = result.Instances?.[0];

      if (!instance?.InstanceId) {
        return { success: false, error: 'No instance ID returned from AWS' };
      }

      await waitUntilInstanceRunning(
        { client: this.ec2, maxWaitTime: 300 },
        { InstanceIds: [instance.InstanceId] },
      );

      const described = await this.describe(instance.InstanceId);
      if (!described) {
        return { success: false, error: 'Instance launched but describe failed' };
      }

      return { success: true, instance: { ...described, tenantId } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown provisioning error' };
    }
  }

  async terminate(instanceId: string): Promise<boolean> {
    try {
      await this.ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
      return true;
    } catch {
      return false;
    }
  }

  async describe(instanceId: string): Promise<TenantInstance | null> {
    try {
      const result = await this.ec2.send(
        new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
      );
      const instance = result.Reservations?.[0]?.Instances?.[0];
      if (!instance) return null;

      const tenantTag = instance.Tags?.find(t => t.Key === 'duster:tenant-id');
      return {
        tenantId: tenantTag?.Value || '',
        instanceId: instance.InstanceId || '',
        publicIp: instance.PublicIpAddress || undefined,
        privateIp: instance.PrivateIpAddress || undefined,
        state: instance.State?.Name || 'unknown',
        launchTime: instance.LaunchTime,
      };
    } catch {
      return null;
    }
  }

  async listTenantInstances(): Promise<TenantInstance[]> {
    try {
      const result = await this.ec2.send(
        new DescribeInstancesCommand({
          Filters: [
            { Name: 'tag:duster:managed', Values: ['true'] },
            { Name: 'instance-state-name', Values: ['running', 'pending'] },
          ],
        }),
      );

      const instances: TenantInstance[] = [];
      for (const reservation of result.Reservations || []) {
        for (const instance of reservation.Instances || []) {
          const tenantTag = instance.Tags?.find(t => t.Key === 'duster:tenant-id');
          instances.push({
            tenantId: tenantTag?.Value || '',
            instanceId: instance.InstanceId || '',
            publicIp: instance.PublicIpAddress || undefined,
            privateIp: instance.PrivateIpAddress || undefined,
            state: instance.State?.Name || 'unknown',
            launchTime: instance.LaunchTime,
          });
        }
      }
      return instances;
    } catch {
      return [];
    }
  }

  async generateTenantToken(tenantId: string): Promise<string> {
    const secret = new TextEncoder().encode(this.config.jwtSecret);
    return new SignJWT({ tenantId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('duster')
      .setAudience('duster-ws')
      .setExpirationTime('365d')
      .sign(secret);
  }
}
