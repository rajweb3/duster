variable "project" {
  type    = string
  default = "duster"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "tenant_instance_type" {
  type    = string
  default = "g6.xlarge"
}

variable "ami_id" {
  type        = string
  description = "Duster tenant AMI built by Packer"
}

variable "dashboard_domain" {
  type    = string
  default = "app.duster.dev"
}

variable "max_tenants" {
  type    = number
  default = 50
}
