#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${1:-main}"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: Falta .env. No se puede actualizar sin la configuración de producción."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Hay cambios locales sin confirmar. Revísalos antes de ejecutar la actualización."
  exit 1
fi

echo "==> Actualizando código desde origin/${BRANCH}"
git pull --ff-only origin "$BRANCH"

echo "==> Instalando dependencias bloqueadas"
corepack enable
pnpm install --frozen-lockfile

echo "==> Aplicando migraciones y compilando"
pnpm db:migrate
pnpm build

echo "==> Actualización preparada. Reinicia la aplicación desde Plesk."
