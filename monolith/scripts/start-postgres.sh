#!/bin/bash

# NOTE: Should we actually do this, or should we require the user to set it?
pass=$(head -c32 /dev/urandom | base64)
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$pass}" 
export POSTGRES_PASSWORD

/usr/local/bin/docker-entrypoint.sh postgres