# 线上部署

服务器 `root@47.118.29.65`（阿里云 ECS，1.8G 内存 + 2G swap），**和 Raccoon Store 正式站共用**。

**当前对外地址：https://evilraccoonvfx.raccoongamingasset.vip**（过渡域名）。
正式域名 evilraccoon.top 还没备案（阿里云会间歇拦截，返回 `Server: Beaver` 403），
站长正在用个体工商户「杭州市上城区狸猫游戏工作室」办理备案。备案下来后按文末「切换到 evilraccoon.top」操作。

## 布局

| 位置 | 内容 |
|---|---|
| `/opt/evil-raccoon/docker-compose.yml` | 本仓库 `deploy/docker-compose.yml`（部署脚本会自动同步） |
| `/opt/evil-raccoon/.env` | 线上配置，只在服务器上（数据库、发信、支付宝密钥），`chmod 600` |
| `/opt/evil-raccoon/media/` | 封面、预览图（`scripts/sync-catalog.sh` 同步），api 容器以 uid 1000 读写 |
| `/opt/evil-raccoon/images/` | 镜像安装包，只留最近 2 个 |
| `/opt/raccoon/nginx/extra-sites/evilraccoonvfx.conf` | 过渡域名转发（= 本仓库 `deploy/nginx-evilraccoonvfx.conf`，已启用 HTTPS） |
| `/opt/raccoon/nginx/extra-sites/evilraccoon.conf` | evilraccoon.top 转发，目前是只有 HTTP 的临时版 |

- 两个容器：`er-api`（FastAPI，启动时自动 `alembic upgrade head`）、`er-web`（nginx 静态文件 + 转发 /api）。
- `er-web` 加入了 Raccoon 的 `raccoon_default` 网络，别名 `evil-raccoon-web`，Raccoon 的 nginx 把域名流量转给它。
  服务名特意加 `er-` 前缀，避免和 Raccoon 自己的 `web` / `api` 别名冲突。
- 数据库：Raccoon 那台阿里云 RDS 上的 `evil_raccoon` 库（同一个账号）。
- 发信：暂用 Raccoon 的阿里云邮件推送（发件人 message@email.raccoongamingasset.vip）。
- 支付宝：沿用 Raccoon 的正式应用（AppID 2021005147611803），钱进同一个商户账户。

## 日常更新

```bash
TAG=v2 ./scripts/deploy.sh      # 每次递增 TAG；本机构建 amd64 镜像 → 上传 → docker load → compose up
```

**服务器上不做任何构建**：在那台机器上构建曾经把内存吃爆、dockerd 被杀，同机的 Raccoon 一起宕机。
前端在本机 `npm run build`，镜像只是把 dist 拷进 nginx；nginx 基础镜像默认从 daocloud 镜像站拉。

首次部署或上了新特效包后，同步素材和商品数据：

```bash
./scripts/sync-catalog.sh       # 线上已有商品时不会覆盖；确实要覆盖用 FORCE=1
```

## 域名和 HTTPS

Raccoon 的 nginx 占着 80/443。它的 `nginx-ssl.conf` 末尾 `include /etc/nginx/extra-sites/*.conf`，
`docker-compose.ssl.yml` 把 `/opt/raccoon/nginx/extra-sites` 挂进容器（这两处改动也在 raccoon_store 仓库里，
Raccoon 部署不会把它冲掉；extra-sites 目录只在服务器上，部署脚本不会覆盖）。

完整的转发配置在本仓库 `deploy/nginx-evilraccoon.conf`。启用 HTTPS：

1. 确认域名不再被阿里云拦截：从外网多试几次
   `curl -sI http://www.evilraccoon.top/` 和 `http://evilraccoon.top/`，不能出现 `Server: Beaver` 的 403。
2. 签证书：
   ```bash
   cd /opt/raccoon && docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml run --rm \
     --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
     -d evilraccoon.top -d www.evilraccoon.top --agree-tos --no-eff-email -n
   ```
3. 用 `deploy/nginx-evilraccoon.conf` 覆盖 `/opt/raccoon/nginx/extra-sites/evilraccoon.conf`，然后
   `docker exec raccoon-nginx-1 nginx -t && docker exec raccoon-nginx-1 nginx -s reload`。
4. 验证 `https://www.evilraccoon.top/` 和 `https://raccoongamingasset.vip/api/healthz` 都是 200。

续期由 Raccoon 的 certbot 容器自动完成。

## 切换到 evilraccoon.top（备案通过后）

1. 按上面「域名和 HTTPS」签证书、换上 `deploy/nginx-evilraccoon.conf` 完整版。
2. 改 `/opt/evil-raccoon/.env`：`SITE_URL`、`ALIPAY_NOTIFY_URL` 换成 `https://www.evilraccoon.top`，
   然后 `cd /opt/evil-raccoon && docker compose up -d er-api`。
3. 过渡域名可以改成 301 跳到新域名（老链接、支付宝里没付完的单还能回来），观察一段时间再删。
4. 页脚加上备案号并链接 https://beian.miit.gov.cn/ ；30 天内办公安联网备案。

## 注意

- 不要在服务器上跑 `docker system prune -a`、`docker system df`（会删别人的镜像 / 把 dockerd 撑爆）。
- 新数据库上线后，**第一个登录的账号就是唯一的管理员**——上线后请站长第一时间用自己的邮箱登录。
