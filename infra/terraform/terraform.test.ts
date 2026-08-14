import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const TERRAFORM_DIR = join(__dirname);
const MODULES_DIR = join(TERRAFORM_DIR, 'modules');

function readTf(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('terraform infrastructure', () => {
  describe('root configuration', () => {
    it('main.tf exists and has required providers', () => {
      const content = readTf(join(TERRAFORM_DIR, 'main.tf'));
      expect(content).toContain('required_version');
      expect(content).toContain('hashicorp/aws');
      expect(content).toContain('backend "s3"');
    });

    it('variables.tf defines all required variables', () => {
      const content = readTf(join(TERRAFORM_DIR, 'variables.tf'));
      expect(content).toContain('variable "project"');
      expect(content).toContain('variable "aws_region"');
      expect(content).toContain('variable "vpc_cidr"');
      expect(content).toContain('variable "ami_id"');
      expect(content).toContain('variable "tenant_instance_type"');
      expect(content).toContain('g6.xlarge');
    });

    it('outputs.tf exposes key outputs', () => {
      const content = readTf(join(TERRAFORM_DIR, 'outputs.tf'));
      expect(content).toContain('output "vpc_id"');
      expect(content).toContain('output "private_subnet_ids"');
      expect(content).toContain('output "tenant_sg_id"');
    });

    it('main.tf wires all four modules', () => {
      const content = readTf(join(TERRAFORM_DIR, 'main.tf'));
      expect(content).toContain('module "vpc"');
      expect(content).toContain('module "security"');
      expect(content).toContain('module "iam"');
      expect(content).toContain('module "compute"');
    });
  });

  describe('vpc module', () => {
    const content = readTf(join(MODULES_DIR, 'vpc', 'main.tf'));

    it('creates VPC with DNS support', () => {
      expect(content).toContain('aws_vpc');
      expect(content).toContain('enable_dns_hostnames = true');
      expect(content).toContain('enable_dns_support   = true');
    });

    it('creates public and private subnets', () => {
      expect(content).toContain('aws_subnet" "public"');
      expect(content).toContain('aws_subnet" "private"');
    });

    it('creates NAT gateway for private subnet internet access', () => {
      expect(content).toContain('aws_nat_gateway');
      expect(content).toContain('aws_eip');
    });

    it('enables VPC flow logs', () => {
      expect(content).toContain('aws_vpc_flow_log');
      expect(content).toContain('traffic_type    = "REJECT"');
    });

    it('creates route tables with proper associations', () => {
      expect(content).toContain('aws_route_table" "public"');
      expect(content).toContain('aws_route_table" "private"');
      expect(content).toContain('aws_route_table_association');
    });
  });

  describe('security module', () => {
    const content = readTf(join(MODULES_DIR, 'security', 'main.tf'));

    it('creates tenant security group', () => {
      expect(content).toContain('aws_security_group" "tenant"');
    });

    it('restricts Hermes API to VPC only', () => {
      expect(content).toContain('from_port   = 8080');
      expect(content).toContain('to_port     = 8080');
      expect(content).toContain('Hermes API from VPC');
    });

    it('creates dashboard security group with HTTPS', () => {
      expect(content).toContain('aws_security_group" "dashboard"');
      expect(content).toContain('from_port   = 443');
    });

    it('creates bastion security group', () => {
      expect(content).toContain('aws_security_group" "bastion"');
    });

    it('uses create_before_destroy lifecycle', () => {
      expect(content).toContain('create_before_destroy = true');
    });
  });

  describe('iam module', () => {
    const content = readTf(join(MODULES_DIR, 'iam', 'main.tf'));

    it('creates tenant IAM role for EC2', () => {
      expect(content).toContain('aws_iam_role" "tenant"');
      expect(content).toContain('ec2.amazonaws.com');
    });

    it('creates instance profile', () => {
      expect(content).toContain('aws_iam_instance_profile');
    });

    it('attaches SSM policy for remote management', () => {
      expect(content).toContain('AmazonSSMManagedInstanceCore');
    });

    it('grants CloudWatch permissions', () => {
      expect(content).toContain('cloudwatch:PutMetricData');
      expect(content).toContain('logs:PutLogEvents');
    });

    it('grants ECR read access', () => {
      expect(content).toContain('ecr:GetDownloadUrlForLayer');
      expect(content).toContain('ecr:BatchGetImage');
    });

    it('creates provisioner role with scoped permissions', () => {
      expect(content).toContain('aws_iam_role" "provisioner"');
      expect(content).toContain('ec2:RunInstances');
      expect(content).toContain('ec2:TerminateInstances');
      expect(content).toContain('iam:PassRole');
    });

    it('conditions provisioner to project tag', () => {
      expect(content).toContain('aws:RequestTag/Project');
    });
  });

  describe('compute module', () => {
    const content = readTf(join(MODULES_DIR, 'compute', 'main.tf'));

    it('creates launch template', () => {
      expect(content).toContain('aws_launch_template" "tenant"');
    });

    it('uses encrypted EBS', () => {
      expect(content).toContain('encrypted             = true');
      expect(content).toContain('volume_type           = "gp3"');
    });

    it('requires IMDSv2', () => {
      expect(content).toContain('http_tokens                 = "required"');
    });

    it('enables detailed monitoring', () => {
      expect(content).toContain('enabled = true');
    });

    it('user data retrieves tenant ID from tags', () => {
      expect(content).toContain('TENANT_ID');
      expect(content).toContain('X-aws-ec2-metadata-token');
      expect(content).toContain('describe-tags');
    });

    it('starts all required services', () => {
      expect(content).toContain('systemctl start ollama');
      expect(content).toContain('systemctl start hermes-agent');
      expect(content).toContain('systemctl start duster-sidecar');
    });
  });
});
