output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  value = module.vpc.public_subnet_ids
}

output "tenant_sg_id" {
  value = module.security.tenant_sg_id
}

output "dashboard_sg_id" {
  value = module.security.dashboard_sg_id
}

output "tenant_instance_profile" {
  value = module.iam.tenant_instance_profile_name
}
