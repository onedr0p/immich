/app/immich/scripts/start-postgres.sh &
redis-server &
/app/immich/scripts/start-server.sh &

wait -n