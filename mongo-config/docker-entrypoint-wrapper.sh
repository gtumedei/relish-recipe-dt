#!/bin/sh
set -e

if [ "$(id -u)" = "0" ]; then
  # Running as root: copy keyfile, set permissions, then re-exec as mongod
  cp /keyfile-src /keyfile
  chown mongod:mongod /keyfile
  chmod 400 /keyfile
  exec su mongod -s /bin/sh -- "$0" "$@"
fi

# Running as mongod: invoke the default entrypoint
exec /usr/bin/python3 /usr/local/bin/docker-entrypoint.py "$@"
