#!/usr/bin/env bash
# 在本机打好 amd64 镜像，传到服务器 docker load，再 compose up。服务器上不做任何构建
# （那台机器只有 1.8G 内存，构建曾经把 dockerd 撑爆、拖垮同机的 raccoon 正式站）。
#
# 用法：TAG=v2 ./scripts/deploy.sh            # 每次部署递增 TAG
#      HOST=root@1.2.3.4 TAG=v2 ./scripts/deploy.sh
set -euo pipefail

HOST="${HOST:-root@47.118.29.65}"
TAG="${TAG:?请指定 TAG，比如 TAG=v2 ./scripts/deploy.sh}"
REMOTE=/opt/evil-raccoon
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="${ROOT}/dist/evil-raccoon-${TAG}.tar.gz"

# Docker Hub 在国内很慢，nginx 基础镜像默认走镜像站（第一次拉完会缓存）
NGINX_IMAGE="${NGINX_IMAGE:-docker.m.daocloud.io/library/nginx:1.27-alpine}"

echo "==> 构建前端静态文件"
(cd "${ROOT}/frontend" && npm ci --no-audit --no-fund && npm run build)

echo "==> 构建镜像 ${TAG}（linux/amd64）"
docker buildx build --platform linux/amd64 -t "evil-raccoon-api:${TAG}" --load "${ROOT}/backend"
docker buildx build --platform linux/amd64 --build-arg "NGINX_IMAGE=${NGINX_IMAGE}" \
  -t "evil-raccoon-web:${TAG}" --load "${ROOT}/frontend"

echo "==> 打包 ${BUNDLE}"
mkdir -p "${ROOT}/dist"
docker save "evil-raccoon-api:${TAG}" "evil-raccoon-web:${TAG}" | gzip > "${BUNDLE}"
ls -lh "${BUNDLE}"

echo "==> 上传到 ${HOST}"
ssh "${HOST}" "mkdir -p ${REMOTE}/images ${REMOTE}/media"
scp "${BUNDLE}" "${HOST}:${REMOTE}/images/"
scp "${ROOT}/deploy/docker-compose.yml" "${HOST}:${REMOTE}/docker-compose.yml"

echo "==> 服务器上加载并启动"
ssh "${HOST}" bash -s -- "${TAG}" <<'REMOTE_SCRIPT'
set -euo pipefail
TAG="$1"
cd /opt/evil-raccoon
test -f .env || { echo "缺少 /opt/evil-raccoon/.env，先按 deploy/README.md 建好" >&2; exit 1; }
gunzip -c "images/evil-raccoon-${TAG}.tar.gz" | docker load
if grep -q '^TAG=' .env; then sed -i "s/^TAG=.*/TAG=${TAG}/" .env; else echo "TAG=${TAG}" >> .env; fi
docker compose up -d
docker compose ps
# 只保留最近 2 个安装包
ls -1t images/evil-raccoon-*.tar.gz | tail -n +3 | xargs -r rm -f
REMOTE_SCRIPT

echo "==> 检查"
ssh "${HOST}" "for i in \$(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:8090/api/health && break; sleep 2; done; curl -fsS http://127.0.0.1:8090/api/health && echo"
echo "部署完成：${TAG}"
