terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "duster-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "duster-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "vpc" {
  source             = "./modules/vpc"
  project            = var.project
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "security" {
  source      = "./modules/security"
  project     = var.project
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  vpc_cidr    = var.vpc_cidr
}

module "iam" {
  source      = "./modules/iam"
  project     = var.project
  environment = var.environment
}

module "compute" {
  source                = "./modules/compute"
  project               = var.project
  environment           = var.environment
  ami_id                = var.ami_id
  instance_type         = var.tenant_instance_type
  subnet_ids            = module.vpc.private_subnet_ids
  security_group_id     = module.security.tenant_sg_id
  instance_profile_name = module.iam.tenant_instance_profile_name
  max_tenants           = var.max_tenants
}
