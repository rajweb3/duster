variable "project" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "vpc_cidr" { type = string }

resource "aws_security_group" "tenant" {
  name_prefix = "${var.project}-${var.environment}-tenant-"
  vpc_id      = var.vpc_id
  description = "Security group for Duster tenant instances"

  # Hermes API — only from dashboard/sidecar within VPC
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Hermes API from VPC"
  }

  # SSH — only from bastion (VPC internal)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "SSH from bastion"
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = {
    Name = "${var.project}-${var.environment}-tenant-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "dashboard" {
  name_prefix = "${var.project}-${var.environment}-dashboard-"
  vpc_id      = var.vpc_id
  description = "Security group for Duster dashboard"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP (redirect to HTTPS)"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = {
    Name = "${var.project}-${var.environment}-dashboard-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "bastion" {
  name_prefix = "${var.project}-${var.environment}-bastion-"
  vpc_id      = var.vpc_id
  description = "Security group for bastion host"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH from anywhere (use SSM instead in production)"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = {
    Name = "${var.project}-${var.environment}-bastion-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

output "tenant_sg_id" {
  value = aws_security_group.tenant.id
}

output "dashboard_sg_id" {
  value = aws_security_group.dashboard.id
}

output "bastion_sg_id" {
  value = aws_security_group.bastion.id
}
