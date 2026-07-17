# Torii indexer for the Starknet mainnet deployment (siege_dojo world). Build
# context is infra/torii-mainnet/ — torii_mainnet.toml here is the source of
# truth for this deployment. Deploy: railway up ./infra/torii-mainnet
# --path-as-root (service: siege-torii-mainnet, project siege-katana). Volume
# at /data.
FROM ghcr.io/dojoengine/dojo:v1.8.0

COPY torii_mainnet.toml /torii.toml

EXPOSE 8080

ENTRYPOINT ["/opt/asdf/installs/torii/1.8.3/bin/torii", \
  "--config", "/torii.toml", \
  "--db-dir", "/data", \
  "--http.addr", "0.0.0.0", \
  "--http.cors_origins", "*"]
