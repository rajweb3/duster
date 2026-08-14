# Duster

Zero-knowledge AI workflow platform for small teams. Each tenant gets an isolated GPU instance running local LLMs with end-to-end encryption — no data leaves the tenant's environment.

## Architecture

```
                         Internet
                            |
                    +-------+-------+
                    |   CloudFront  |
                    |   + WAF       |
                    +-------+-------+
                            |
              +-------------+-------------+
              |     Dashboard (Next.js)   |
              |     +-----------------+   |
              |     | REST API        |   |
              |     | WebSocket /ws   |   |
              |     | Auth (JWT+mTLS) |   |
              |     +-----------------+   |
              |             |             |
              +------+------+------+------+
                     |             |
          +----------+--+    +----+----------+
          |  PostgreSQL |    |  Provisioner  |
          |  (Drizzle)  |    |  (EC2 + KMS)  |
          +-------------+    +----+----------+
                                  |
                    +-------------+-------------+
                    |        AWS VPC            |
                    |   (Private Subnets)       |
                    |                           |
                    |   +-------------------+   |
                    |   | Tenant Instance   |   |
                    |   | (g6.xlarge GPU)   |   |
                    |   |                   |   |
                    |   | +-------------+   |   |
                    |   | | Ollama      |   |   |
                    |   | | (Muse LLM)  |   |   |
                    |   | +-------------+   |   |
                    |   | +-------------+   |   |
                    |   | | Hermes      |   |   |
                    |   | | (Agent FW)  |   |   |
                    |   | +-------------+   |   |
                    |   | +-------------+   |   |
                    |   | | Sidecar     |   |   |
                    |   | | (WS+mTLS)   |   |   |
                    |   | +-------------+   |   |
                    |   +-------------------+   |
                    +---------------------------+
```

### Component Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| **Dashboard** | `apps/dashboard/` | Next.js 14 app — tenant management UI, REST API, WebSocket server |
| **Provisioner** | `packages/provisioner/` | EC2 instance lifecycle — launch, configure, terminate tenant VMs |
| **Sidecar** | `packages/sidecar/` | Agent running on each tenant instance — WS heartbeat, command relay, metrics |
| **Shared** | `packages/shared/` | Message schemas, validation, types shared across packages |
| **Workflows** | `packages/workflows/` | Workflow templates deployed to tenant instances |
| **Infrastructure** | `infra/terraform/` | VPC, security groups, IAM, compute modules |
| **AMI Builder** | `infra/packer/` | Packer template for pre-baked tenant GPU images |

### Data Flow

```
Tenant Instance                    Dashboard                     Database
     |                                |                             |
     |-- WebSocket (Bearer JWT) ----->|                             |
     |                                |-- Verify JWT (HS256) ------>|
     |<-- config.sync.request --------|                             |
     |-- heartbeat (30s) ------------>|-- updateHeartbeat --------->|
     |-- metrics (10s) -------------->|-- store metrics ----------->|
     |                                |                             |
     |<-- command.execute ------------|<-- API request (admin) -----|
     |-- command.ack ---------------->|-- log audit --------------->|
```

### Security Model

| Layer | Mechanism |
|-------|-----------|
| Transport | mTLS between sidecar and dashboard (per-tenant client certs) |
| Authentication | JWT (HS256) with issuer/audience validation |
| Encryption at rest | AWS KMS envelope encryption per tenant |
| Network isolation | Private subnets, security groups, no public IPs on tenant instances |
| Certificate revocation | In-memory CRL with database persistence, atomic reload |
| Rate limiting | Per-IP with CIDR-aware trusted proxy detection |
| Instance metadata | IMDSv2 required (hop limit 1) |

## Repository Structure

```
duster/
├── apps/
│   └── dashboard/          # Next.js 14 (App Router) + custom server.ts
│       ├── app/api/        # REST endpoints (auth, tenants, provision, billing)
│       ├── server.ts       # HTTP + WebSocket server
│       └── src/lib/        # Core libraries (mtls, kms, rate-limit, ws)
├── packages/
│   ├── provisioner/        # EC2 provisioning + user-data generation
│   ├── sidecar/            # Tenant-side WebSocket agent
│   ├── shared/             # Message types and validation
│   └── workflows/          # AI workflow templates
├── infra/
│   ├── terraform/          # AWS infrastructure (VPC, SG, IAM, compute)
│   └── packer/             # Tenant AMI build (Ollama + Hermes + Sidecar)
├── scripts/                # Stress testing utilities
├── tests/                  # Integration test suite
├── docker-compose.yml      # Local dev environment
└── vitest.config.ts        # Test configuration
```

## Deployment

### Prerequisites

- Node.js 22 LTS
- PostgreSQL 16
- AWS CLI configured with appropriate permissions
- Terraform >= 1.5
- Packer >= 1.9
- Docker (for local development)

### Step 1: Infrastructure (Terraform)

Provisions the VPC, security groups, IAM roles, and compute configuration.

```bash
cd infra/terraform

# Initialize and configure backend
terraform init

# Review the plan
terraform plan -var-file="production.tfvars"

# Apply infrastructure
terraform apply -var-file="production.tfvars"
```

This creates:
- VPC with public/private subnets across availability zones
- Security groups (dashboard SG, tenant SG with inter-communication rules)
- IAM instance profiles for tenant EC2 instances
- S3 backend for state with DynamoDB locking

### Step 2: AMI Build (Packer)

Builds the pre-baked GPU AMI with Ollama, Hermes agent, and the Duster sidecar.

```bash
cd infra/packer

# Validate the template
packer validate -var-file="variables.pkrvars.hcl" duster-tenant.pkr.hcl

# Build the AMI
packer build -var-file="variables.pkrvars.hcl" duster-tenant.pkr.hcl
```

The AMI includes:
- Ubuntu 22.04 with NVIDIA GPU drivers
- Ollama with pre-pulled Muse Glimmer model weights
- Hermes agent framework configured for local Ollama
- Duster sidecar binary
- Workflow templates
- systemd services (ollama, hermes-agent, duster-sidecar)

### Step 3: Dashboard Deployment

```bash
# Install dependencies
npm install

# Set environment variables
export DATABASE_URL="postgresql://user:pass@host:5432/duster"
export JWT_SECRET="<32+ character secret>"
export AWS_REGION="us-east-1"
export STRIPE_SECRET_KEY="sk_live_..."
export STRIPE_WEBHOOK_SECRET="whsec_..."

# Run database migrations
npx drizzle-kit push

# Build and start
npm run build --workspace=apps/dashboard
node apps/dashboard/.next/standalone/server.js
```

The dashboard exposes:
- Port 3000: HTTP (Next.js pages + API routes)
- Port 3000 `/ws`: WebSocket endpoint for tenant connections

### Step 4: Certificate Authority Setup

Generate the Duster CA for mTLS:

```bash
# Generate CA key and certificate (done once)
openssl genrsa -out ca.key 4096
openssl req -new -x509 -key ca.key -out ca.crt -days 3650 \
  -subj "/CN=Duster CA/O=Duster"

# Set environment variables
export DUSTER_CA_KEY_PATH="/etc/duster/ca.key"
export DUSTER_CA_CERT_PATH="/etc/duster/ca.crt"
```

Per-tenant certificates are generated automatically during provisioning and delivered to instances via the user-data script.

### Step 5: Provisioning a Tenant

Provisioning is triggered via the API:

```bash
curl -X POST http://dashboard:3000/api/provision \
  -H "x-tenant-id: <tenant-uuid>" \
  -H "x-user-role: owner" \
  -H "x-user-id: <user-uuid>"
```

This:
1. Validates tenant status and locks to `provisioning`
2. Generates a per-tenant mTLS certificate signed by the CA
3. Generates a JWT for sidecar authentication
4. Launches an EC2 instance with user-data that:
   - Writes tenant config to `/etc/duster/config.env`
   - Writes JWT to `/etc/duster/token.jwt`
   - Writes mTLS certs to `/etc/duster/tls/`
   - Starts Ollama, Hermes, and sidecar services
5. Waits for instance to reach `running` state
6. Updates tenant status to `active`

### Step 6: Local Development

```bash
# Start PostgreSQL
docker compose up -d postgres

# Run the dashboard in dev mode
cd apps/dashboard
npm run dev

# Run tests
npm test
```

## Testing

The project uses Vitest with 554 tests across unit, integration, and infrastructure layers.

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run apps/dashboard/src/lib/mtls.test.ts

# Run integration tests
npm run test:integration

# Type check
npx tsc --noEmit
```

### Test Coverage

| Area | Tests | What's Covered |
|------|-------|----------------|
| mTLS | Certificate generation, validation, revocation, CRL reload |  |
| Rate Limiting | IP normalization, CIDR matching, trusted proxy detection |  |
| WebSocket | Auth flow, heartbeat, reconnection, dormant mode |  |
| Provisioner | EC2 launch, user-data generation, token creation |  |
| Billing | Stripe webhook handling, subscription lifecycle |  |
| Auth | JWT verification, session management, CSRF protection |  |
| Infrastructure | Terraform plan validation, Packer template checks |  |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes (prod) | HMAC secret for JWT signing (32+ chars) |
| `AWS_REGION` | Yes | AWS region for EC2 provisioning |
| `DUSTER_CA_KEY_PATH` | Yes | Path to CA private key |
| `DUSTER_CA_CERT_PATH` | Yes | Path to CA certificate |
| `STRIPE_SECRET_KEY` | Yes | Stripe API key for billing |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook verification secret |
| `STRIPE_PRICE_ID` | Yes | Stripe price ID for subscription plan |
| `AMI_ID` | Yes | Pre-built tenant AMI ID |
| `SUBNET_ID` | Yes | Private subnet for tenant instances |
| `SECURITY_GROUP_ID` | Yes | Security group for tenant instances |
| `KEY_NAME` | No | SSH key pair name (for debugging) |
| `IAM_INSTANCE_PROFILE` | No | IAM profile for tenant instances |
