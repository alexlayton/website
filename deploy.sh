#!/usr/bin/env bash
set -euo pipefail

# Manual deploy to Cloudflare Pages.
# Usage:
#   ./deploy.sh
#   ./deploy.sh personal
#   CLOUDFLARE_PROJECT_NAME=personal ./deploy.sh

PROJECT_NAME="${1:-${CLOUDFLARE_PROJECT_NAME:-personal}}"

if [ -z "$PROJECT_NAME" ]; then
  echo "Error: set the project name."
  echo "Example: ./deploy.sh personal"
  exit 1
fi

bun install --frozen-lockfile
bun run build
bunx wrangler pages deploy dist --project-name="$PROJECT_NAME"
