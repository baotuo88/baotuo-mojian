#!/bin/sh
set -eu

# Some Docker credential helpers expose an SSH agent socket that makes
# Compose Buildx create an invalid session header. Keep it out of this build.
unset SSH_AUTH_SOCK

exec docker compose "$@"
