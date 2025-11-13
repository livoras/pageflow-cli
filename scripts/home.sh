#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command>"
  echo "Example: $0 'ls -la'"
  exit 1
fi

# Execute command on remote home server (free-server)
ssh -p 22 root@100.74.12.43 "source ~/.zshrc && $*"
