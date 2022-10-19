ARG IMMICH_VERSION=v1.32.0_50-dev
# HACK: We cannot substitute env vars in `COPY --from=` directly
FROM altran1502/immich-server:${IMMICH_VERSION} as server
FROM altran1502/immich-machine-learning:${IMMICH_VERSION} as machine-learning
FROM altran1502/immich-web:${IMMICH_VERSION} as web
FROM altran1502/immich-proxy:${IMMICH_VERSION} as proxy

# Don't judge :(
FROM postgres:14-alpine

WORKDIR /app/immich

RUN apk add redis nodejs nginx

COPY scripts ./scripts

RUN addgroup -S immich && adduser -S immich -G immich
RUN chown -R immich /app/immich
RUN chown -R immich /var/run/postgresql

# Default env vars setup
ENV REDIS_HOSTNAME=localhost

ENV DB_HOSTNAME=localhost
ENV DB_USERNAME=immich
ENV DB_PASSWORD=unused
ENV DB_DATABASE_NAME=postgres

ENV PGDATA=/app/immich/data
ENV POSTGRES_USER=${DB_USERNAME}
ENV POSTGRES_DB=${DB_DATABASE_NAME}
# POSTGRES_PASSWORD is randomly generated on startup, because we don't need it when connecting from localhost

ENV NODE_ENV=production

COPY --from=server /usr/src/app /app/immich/apps/server

VOLUME [ "/app/immich/upload" ]

USER immich
CMD [ "/app/immich/scripts/start-all.sh" ]