#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: Crea el archivo .env antes de instalar. Consulta docs/environment-reference.md."
  exit 1
fi

echo "==> Activando Corepack e instalando dependencias bloqueadas"
corepack enable
pnpm install --frozen-lockfile

echo "==> Aplicando migraciones de base de datos"
pnpm db:migrate

echo "==> Compilando activos de producción"
pnpm build

echo "==> Instalación preparada. Reinicia la aplicación desde Plesk."
