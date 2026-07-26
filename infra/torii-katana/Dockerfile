# Torii indexer for the self-hosted Railway katana (SIEGE chain). Build context
# is infra/torii-katana/ — torii_katana.toml here is the source of truth for
# this deployment (no repo-root copy; the katana chain has no external config
# consumers). Deploy: railway up ./infra/torii-katana --path-as-root
# (service: siege-torii-katana, project siege-katana). Volume at /data.
#
# Image: torii publishes its own image since the split from the dojo monorepo;
# ghcr.io/dojoengine/dojo:v1.8.X stopped at torii 1.8.3. ENTRYPOINT is tini
# (inherited from the image); the torii binary is on PATH, so the invocation
# lives in CMD.
FROM ghcr.io/dojoengine/torii:v1.8.16

COPY torii_katana.toml /torii.toml

EXPOSE 8080

# --db-dir points at a FRESH subpath, not /data itself: the 1.8.16 upgrade
# doubles as the reindex that backfills event_messages_historical (the
# [sql] historical config never ran under 1.8.3 — it was silently dropped
# from its old [events] location — so pre-upgrade ConquestResolved emissions
# only exist via replay). The old 1.8.3 database stays untouched at /data/*
# for rollback; delete it once 1.8.16 has soaked.
CMD ["torii", \
  "--config", "/torii.toml", \
  "--db-dir", "/data/torii-v1816", \
  "--http.addr", "0.0.0.0", \
  "--http.cors_origins", "*"]
