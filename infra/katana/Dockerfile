# Self-hosted Katana appchain for Railway (Cartridge slot deployments are
# discontinued; public-sepolia AVNU sponsorship outage 2026-07 made hosted
# sepolia unusable for Controller sign-in). Build context is infra/katana/.
#
# --cartridge.paymaster declares all Controller classes at genesis and lets the
# Cartridge keychain auto-deploy controller accounts on this chain; --dev.no-fee
# removes the need for any sponsorship. Dev accounts use the default seed —
# public well-known keys, acceptable for a test chain only.
#
# Deploy: railway up (service: siege-katana). A Railway volume must be mounted
# at /data so chain state survives restarts (unlike torii it CANNOT re-derive).
FROM ghcr.io/dojoengine/dojo:v1.8.0

EXPOSE 5050

ENTRYPOINT ["/opt/asdf/installs/katana/1.7.0/bin/katana", \
  "--db-dir", "/data", \
  "--http.addr", "0.0.0.0", \
  "--http.port", "5050", \
  "--http.cors_origins", "*", \
  "--dev", \
  "--dev.no-fee", \
  "--cartridge.paymaster", \
  "--chain-id", "SIEGE"]
