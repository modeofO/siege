# Torii indexer for the Starknet mainnet deployment (siege_dojo world). Build
# context is infra/torii-mainnet/ — torii_mainnet.toml here is the source of
# truth for this deployment. Deploy: railway up ./infra/torii-mainnet
# --path-as-root (service: siege-torii-mainnet, project siege-katana). Volume
# at /data.
#
# Image: torii publishes its own image since the split from the dojo monorepo;
# ghcr.io/dojoengine/dojo:v1.8.X stopped at torii 1.8.3. ENTRYPOINT is tini
# (inherited from the image); the torii binary is on PATH, so the invocation
# lives in CMD.
#
# --db-dir stays at /data (unlike katana, which reindexed fresh on the 1.8.16
# upgrade): a mainnet replay would crawl through the throttled Alchemy demo
# RPC and leave the live frontend reading a lagging index the whole time.
# 1.8.16 migrates the 1.8.3 database in place; event_messages_historical
# records from the upgrade onward (mainnet had zero conquest emissions before
# it, so nothing is lost to the missing backfill).
FROM ghcr.io/dojoengine/torii:v1.8.16

COPY torii_mainnet.toml /torii.toml

EXPOSE 8080

CMD ["torii", \
  "--config", "/torii.toml", \
  "--db-dir", "/data", \
  "--http.addr", "0.0.0.0", \
  "--http.cors_origins", "*"]
