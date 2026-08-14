variable "project" { type = string }
variable "environment" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "instance_profile_name" { type = string }
variable "max_tenants" { type = number }

resource "aws_launch_template" "tenant" {
  name_prefix   = "${var.project}-${var.environment}-tenant-"
  image_id      = var.ami_id
  instance_type = var.instance_type

  iam_instance_profile {
    name = var.instance_profile_name
  }

  vpc_security_group_ids = [var.security_group_id]

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 100
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
      iops                  = 3000
      throughput            = 125
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name    = "${var.project}-${var.environment}-tenant"
      Project = var.project
      Role    = "tenant"
    }
  }

  tag_specifications {
    resource_type = "volume"
    tags = {
      Name    = "${var.project}-${var.environment}-tenant-vol"
      Project = var.project
    }
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    set -euo pipefail

    # Tenant ID is passed as instance tag, retrieved via IMDS
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
    INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)

    # Wait for tenant-id tag
    TENANT_ID=""
    for i in $(seq 1 30); do
      TENANT_ID=$(aws ec2 describe-tags --filters "Name=resource-id,Values=$INSTANCE_ID" "Name=key,Values=TenantId" --query "Tags[0].Value" --output text 2>/dev/null || true)
      [ "$TENANT_ID" != "None" ] && [ -n "$TENANT_ID" ] && break
      sleep 2
    done

    # Write tenant config
    cat > /etc/duster/tenant.env <<ENVEOF
    TENANT_ID=$TENANT_ID
    INSTANCE_ID=$INSTANCE_ID
    DASHBOARD_URL=wss://app.duster.dev/ws
    ENVEOF

    # Start services
    systemctl start ollama
    systemctl start hermes-agent
    systemctl start duster-sidecar
  EOF
  )

  lifecycle {
    create_before_destroy = true
  }
}

output "launch_template_id" {
  value = aws_launch_template.tenant.id
}

output "launch_template_latest_version" {
  value = aws_launch_template.tenant.latest_version
}
