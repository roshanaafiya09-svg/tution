# Phase 4 (blueprint §9/§10) needs PostGIS alongside the pgvector
# extension Phase 3's RAG doubt solver already depends on — one
# container needs both extensions' binaries available. postgis/postgis
# already carries the PGDG apt repo plus PostGIS baked in; pgvector has
# an official PGDG package for the same Postgres major version, so it's
# added on top rather than building either extension from source.
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*
