#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js 22.12+ first."; exit 1; }
if [ ! -f .env ]; then cp .env.example .env; fi
npm ci
npm run build
printf '\nOpen http://localhost:3000 after the server starts. Local development only.\n\n'
exec npm start
