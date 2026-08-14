export interface UserDataParams {
  tenantId: string;
  dashboardUrl: string;
  jwtToken: string;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
}

export function generateUserData(params: UserDataParams): string {
  const tlsBlock = params.tlsCert && params.tlsKey && params.tlsCa ? `
# Write mTLS certificates
mkdir -p /etc/duster/tls
cat > /etc/duster/tls/client.crt <<'CERTEOF'
${params.tlsCert}
CERTEOF
cat > /etc/duster/tls/client.key <<'KEYEOF'
${params.tlsKey}
KEYEOF
cat > /etc/duster/tls/ca.crt <<'CAEOF'
${params.tlsCa}
CAEOF
chmod 600 /etc/duster/tls/client.key
chmod 644 /etc/duster/tls/client.crt /etc/duster/tls/ca.crt

# Add mTLS config
cat >> /etc/duster/config.env <<'MTLSEOF'
DUSTER_USE_MTLS=true
DUSTER_TLS_CERT_PATH=/etc/duster/tls/client.crt
DUSTER_TLS_KEY_PATH=/etc/duster/tls/client.key
DUSTER_TLS_CA_PATH=/etc/duster/tls/ca.crt
MTLSEOF
` : '';

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
${tlsBlock}
# Start services
systemctl enable --now ollama
systemctl enable --now hermes-agent
systemctl enable --now duster-sidecar

# Signal boot complete
echo "DUSTER_BOOT_COMPLETE=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /etc/duster/boot-status
`;

  return Buffer.from(script).toString('base64');
}
