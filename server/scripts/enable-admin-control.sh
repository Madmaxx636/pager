#!/usr/bin/env bash
# Lets the admin page restart, stop and start bridges, read their logs and change a few of their options.
#
# What this means: the Pager API container gets access to your container runtime (the Docker/Podman socket) and to the
# bridges' config files. Only signed-in admins can use it and it only does those few things, but anyone who could take over
# that container could control your containers. Turn it off with:  ./scripts/enable-admin-control.sh --off
set -euo pipefail
cd "$(dirname "$0")/.."
set_env() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
unset_env() { sed -i "/^$1=/d" .env; }

if [ "${1:-}" = "--off" ]; then
  for k in DOCKER_SOCKET DOCKER_GID ADMIN_BRIDGES_DIR BRIDGES_DIR_HOST; do unset_env $k; done
  docker compose up -d api
  echo "Admin bridge controls are off."
  exit 0
fi

sock=""
for c in /var/run/docker.sock "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock"; do [ -S "$c" ] && sock="$c" && break; done
[ -n "$sock" ] || { echo "Couldn't find the Docker or Podman socket. Set DOCKER_SOCKET in .env yourself." >&2; exit 1; }
set_env DOCKER_SOCKET "$sock"
set_env DOCKER_GID "$(stat -c %g "$sock")"
set_env ADMIN_BRIDGES_DIR /bridges
set_env BRIDGES_DIR_HOST ./data/bridges
docker compose up -d api
echo "Admin bridge controls are on (socket: $sock). Reload the Admin page."
