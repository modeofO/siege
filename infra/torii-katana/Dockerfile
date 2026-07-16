# Torii indexer for the self-hosted Railway katana (SIEGE chain). Build context
# is infra/torii-katana/ — torii_katana.toml here is the source of truth for
# this deployment (no repo-root copy; the katana chain has no external config
# consumers). Deploy: railway up ./infra/torii-katana --path-as-root
# (service: siege-torii-katana, project siege-katana). Volume at /data.
FROM ghcr.io/dojoengine/dojo:v1.8.0

COPY torii_katana.toml /torii.toml

EXPOSE 8080

ENTRYPOINT ["/opt/asdf/installs/torii/1.8.3/bin/torii", \
  "--config", "/torii.toml", \
  "--db-dir", "/data", \
  "--http.addr", "0.0.0.0", \
  "--http.cors_origins", "*"]
