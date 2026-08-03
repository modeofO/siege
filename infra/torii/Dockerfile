# Self-hosted Sepolia Torii for Railway (Cartridge slot no longer accepts new
# torii deployments). Sepolia itself is PARKED (Cartridge sponsorship outage,
# see repo CLAUDE.md) — this service is kept for revival, and unlike the
# mainnet/katana toriis it is still on the pre-split dojo image (torii 1.8.3).
# Build context is infra/torii/ — torii_sepolia.toml here is
# a copy of the repo-root file; keep them in sync when the config changes.
#
# Deploy: railway up (service: siege-torii). A Railway volume must be mounted at
# /data so the index survives restarts (it re-derives from chain if lost).
FROM ghcr.io/dojoengine/dojo:v1.8.0

COPY torii_sepolia.toml /torii.toml

EXPOSE 8080

ENTRYPOINT ["/opt/asdf/installs/torii/1.8.3/bin/torii", \
  "--config", "/torii.toml", \
  "--db-dir", "/data", \
  "--http.addr", "0.0.0.0", \
  "--http.cors_origins", "*"]
