variable "project" { type = string }
variable "environment" { type = string }

resource "aws_iam_role" "tenant" {
  name = "${var.project}-${var.environment}-tenant-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = {
    Name = "${var.project}-${var.environment}-tenant-role"
  }
}

resource "aws_iam_instance_profile" "tenant" {
  name = "${var.project}-${var.environment}-tenant-profile"
  role = aws_iam_role.tenant.name
}

# SSM for remote management without SSH
resource "aws_iam_role_policy_attachment" "tenant_ssm" {
  role       = aws_iam_role.tenant.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# CloudWatch for metrics and logs
resource "aws_iam_policy" "tenant_cloudwatch" {
  name = "${var.project}-${var.environment}-tenant-cloudwatch"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "cloudwatch:PutMetricData",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams",
      ]
      Effect   = "Allow"
      Resource = "*"
      Condition = {
        StringEquals = {
          "aws:RequestedRegion" = "us-east-1"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "tenant_cloudwatch" {
  role       = aws_iam_role.tenant.name
  policy_arn = aws_iam_policy.tenant_cloudwatch.arn
}

# ECR read access for pulling sidecar container
resource "aws_iam_policy" "tenant_ecr" {
  name = "${var.project}-${var.environment}-tenant-ecr"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:GetAuthorizationToken",
      ]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "tenant_ecr" {
  role       = aws_iam_role.tenant.name
  policy_arn = aws_iam_policy.tenant_ecr.arn
}

# Provisioner role — used by the dashboard to launch instances
resource "aws_iam_role" "provisioner" {
  name = "${var.project}-${var.environment}-provisioner-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "provisioner" {
  name = "${var.project}-${var.environment}-provisioner-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "ec2:RunInstances",
          "ec2:TerminateInstances",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:CreateTags",
        ]
        Effect   = "Allow"
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/Project" = var.project
          }
        }
      },
      {
        Action   = "iam:PassRole"
        Effect   = "Allow"
        Resource = aws_iam_role.tenant.arn
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "provisioner" {
  role       = aws_iam_role.provisioner.name
  policy_arn = aws_iam_policy.provisioner.arn
}

output "tenant_role_arn" {
  value = aws_iam_role.tenant.arn
}

output "tenant_instance_profile_name" {
  value = aws_iam_instance_profile.tenant.name
}

output "provisioner_role_arn" {
  value = aws_iam_role.provisioner.arn
}
