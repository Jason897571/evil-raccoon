#!/usr/bin/env bash
# 首次部署（或上新包）时，把本地的预览素材和特效包数据搬到线上。
# 先确保本地已经跑过 backend 的 import_packs，线上已经 deploy.sh 起好服务。
#
# 用法：./scripts/sync-catalog.sh            # 只同步素材 + 线上为空时导入数据
#      FORCE=1 ./scripts/sync-catalog.sh    # 覆盖线上全部特效包数据（慎用）
set -euo pipefail

HOST="${HOST:-root@47.118.29.65}"
REMOTE=/opt/evil-raccoon
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 同步预览素材（covers / skills / hero，不动线上上传的收款码）"
COPYFILE_DISABLE=1 tar -C "${ROOT}/backend/media" -czf - covers skills hero \
  | ssh "${HOST}" "mkdir -p ${REMOTE}/media && tar -xzf - -C ${REMOTE}/media && chown -R 1000:1000 ${REMOTE}/media && du -sh ${REMOTE}/media"

echo "==> 导出本地特效包数据"
mkdir -p "${ROOT}/dist"
(cd "${ROOT}/backend" && uv run python -m scripts.catalog_io export) > "${ROOT}/dist/catalog.json"

echo "==> 导入线上"
scp "${ROOT}/dist/catalog.json" "${ROOT}/backend/scripts/catalog_io.py" "${HOST}:/tmp/"
ssh "${HOST}" "cd ${REMOTE} && docker compose cp /tmp/catalog.json er-api:/tmp/catalog.json \
  && docker compose cp /tmp/catalog_io.py er-api:/tmp/catalog_io.py \
  && docker compose exec -T -w /app er-api python /tmp/catalog_io.py import /tmp/catalog.json ${FORCE:+--force}; \
  rm -f /tmp/catalog.json /tmp/catalog_io.py"
