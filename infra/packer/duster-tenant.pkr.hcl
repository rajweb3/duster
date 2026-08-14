packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "instance_type" {
  type    = string
  default = "g6.xlarge"
}

variable "base_ami_filter" {
  type    = string
  default = "Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04) *"
}

variable "sidecar_version" {
  type    = string
  default = "0.1.0"
}

variable "hermes_version" {
  type    = string
  default = "latest"
}

variable "muse_glimmer_model" {
  type    = string
  default = "muse-glimmer"
}

source "amazon-ebs" "duster-tenant" {
  ami_name      = "duster-tenant-v${var.sidecar_version}-{{timestamp}}"
  instance_type = var.instance_type
  region        = var.aws_region

  source_ami_filter {
    filters = {
      name                = var.base_ami_filter
      root-device-type    = "ebs"
      virtualization-type = "hvm"
      architecture        = "x86_64"
    }
    most_recent = true
    owners      = ["amazon"]
  }

  ssh_username = "ubuntu"

  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 100
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  tags = {
    Name           = "duster-tenant-v${var.sidecar_version}"
    "duster:type"  = "tenant-ami"
    "duster:version" = var.sidecar_version
    Built          = "{{timestamp}}"
  }
}

build {
  name = "duster-tenant"
  sources = ["source.amazon-ebs.duster-tenant"]

  # System updates
  provisioner "shell" {
    inline = [
      "sudo apt-get update -y",
      "sudo apt-get upgrade -y",
      "sudo apt-get install -y curl wget jq unzip",
    ]
  }

  # Install Node.js 22 LTS
  provisioner "shell" {
    inline = [
      "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -",
      "sudo apt-get install -y nodejs",
      "node --version",
    ]
  }

  # Install Ollama
  provisioner "shell" {
    inline = [
      "curl -fsSL https://ollama.ai/install.sh | sh",
      "ollama --version",
    ]
  }

  # Pre-pull Muse Glimmer model weights
  provisioner "shell" {
    inline = [
      "sudo systemctl start ollama",
      "sleep 5",
      "ollama pull ${var.muse_glimmer_model}",
      "ollama list",
      "sudo systemctl stop ollama",
    ]
  }

  # Install Hermes agent framework (official Nous Research installer)
  provisioner "shell" {
    inline = [
      "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | sudo bash",
      "hermes --version || true",
      "sudo -u duster hermes config set model ${var.muse_glimmer_model}",
      "sudo -u duster hermes config set provider ollama",
    ]
  }

  # Copy sidecar binary
  provisioner "file" {
    source      = "../../packages/sidecar/dist/"
    destination = "/opt/duster/sidecar/"
  }

  # Copy workflow templates
  provisioner "file" {
    source      = "../../packages/workflows/"
    destination = "/opt/duster/workflows/"
  }

  # Setup systemd services
  provisioner "file" {
    source      = "systemd/"
    destination = "/tmp/systemd/"
  }

  provisioner "shell" {
    inline = [
      "sudo cp /tmp/systemd/*.service /etc/systemd/system/",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable ollama",
      "sudo systemctl enable hermes-agent",
      "sudo systemctl enable duster-sidecar",
    ]
  }

  # Create duster directories
  provisioner "shell" {
    inline = [
      "sudo mkdir -p /etc/duster",
      "sudo mkdir -p /opt/duster/data",
      "sudo mkdir -p /opt/duster/logs",
      "sudo chmod 750 /etc/duster",
    ]
  }

  # Cleanup
  provisioner "shell" {
    inline = [
      "sudo apt-get clean",
      "sudo rm -rf /tmp/*",
      "sudo rm -rf /var/tmp/*",
    ]
  }
}
