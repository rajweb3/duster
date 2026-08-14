export interface UserDataParams {
  tenantId: string;
  dashboardUrl: string;
  jwtToken: string;
}

export function generateUserData(params: UserDataParams): string {
  const script = `#!/bin/bash
set -euo pipefail

# Write tenant config
mkdir -p /etc/duster
cat > /etc/duster/config.env <<'ENVEOF'
DUSTER_TENANT_ID=${params.tenantId}
DUSTER_DASHBOARD_URL=${params.dashboardUrl}
DUSTER_JWT_PATH=/etc/duster/token.jwt
DUSTER_HERMES_URL=http://127.0.0.1:8080
DUSTER_HEARTBEAT_MS=30000
DUSTER_METRICS_MS=10000
ENVEOF

# Write JWT token
cat > /etc/duster/token.jwt <<'TOKENEOF'
${params.jwtToken}
TOKENEOF
chmod 600 /etc/duster/token.jwt

# Start services
systemctl enable --now ollama
systemctl enable --now hermes-agent
systemctl enable --now duster-sidecar

# Signal boot complete
echo "DUSTER_BOOT_COMPLETE=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /etc/duster/boot-status
`;

  return Buffer.from(script).toString('base64');
}
