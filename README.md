# Evil Raccoon 像素特效商城

64×64 像素技能特效的自建商店。前端 React（Vite + TypeScript），后端 Python（FastAPI + SQLAlchemy + Alembic），数据库 MySQL。

当前进度：首页、特效包详情页（GIF / PNG 预览）、购物车、邮箱验证码登录、订单、「我的素材」（付款后显示网盘链接）、
管理后台（充电档位编辑、API token），以及用 token 通过 API 上下架和修改内容。
**真实支付还没接**：开发环境用订单页的「模拟支付」按钮代替。

## 本地运行

需要：MySQL 8+、[uv](https://docs.astral.sh/uv/)、Node 20+。先把 `backend/.env.example` 复制成 `backend/.env`，填好 `DATABASE_URL`（账号密码）。

```bash
# 1. 后端
cd backend
uv sync
uv run alembic upgrade head              # 建库建表（evil_raccoon），以后改了表结构也跑这条
uv run python -m scripts.import_packs    # 导入特效包和预览图
uv run uvicorn app.main:app --port 8100 --reload

# 2. 前端（另开一个终端）
cd frontend
npm install
npm run dev        # http://localhost:5180，/api 和 /media 代理到 8100
```

设管理员（邮箱没注册过也行，之后用它登录就是管理员）：

```bash
cd backend
uv run python -m scripts.set_admin you@example.com            # 取消加 --revoke
```

配置项见 `backend/.env.example`。开发模式下不配发信邮箱也能登录：验证码会直接显示在登录页上，后端日志里也有。

## 测试

```bash
cd backend
uv run pytest      # 用单独的 evil_raccoon_test 库，不碰开发数据
```

## 数据从哪来

`scripts/import_packs.py` 可以重复跑：新包按爱发电数据写入全部内容；**已有的包只刷新图片**，名称、价格、简介、上下架、技能文案这些可能在后台或 API 里改过的内容不动。要按爱发电重新覆盖文字，加 `--overwrite`。不会动用户和订单。

| 内容 | 来源 |
|---|---|
| 包名、价格、简介、技能中文名 / 说明 / 动画阶段 | `backend/seed/afdian_raw.json`（从爱发电 `/api/creator/all-plans` 导出） |
| 封面 | `pixel-skill/release/itch_*/xhs/cover.png`（小红书封面），缩到 720×960 |
| 详情页 GIF | `release/itch_*/shot_<技能>.gif`（itch 用的带水印版） |
| 详情页 PNG | 压缩包里的精灵图，放大 2 倍并加水印 |
| 首屏 12 格 | 压缩包里的透明底 GIF，技能列表在 `app/catalog.py` 的 `HERO_TILES` |
| 网盘链接 | `backend/netdisk.json`（不进 git，格式见 `netdisk.example.json`） |

新上一个包：在爱发电上架后重新导出 `afdian_raw.json`，在 `app/catalog.py` 的 `PACKS` 里加一行（主题词 → slug、元素、release 目录），把网盘链接写进 `netdisk.json`，再跑一次导入脚本。

## 登录和订单

- 登录：邮箱 → 6 位验证码（10 分钟有效，60 秒内不能重发，每小时最多 10 次，输错 5 次作废）。第一次登录自动注册。会话放在 httpOnly cookie 里，30 天有效。验证码和会话 token 在库里只存 HMAC。
- 订单：`pending` → `paid` / `cancelled`。下单时存一份包名和价格快照；已经买过的包不能重复下单。
- 付款成功的唯一入口是 `app/routers/orders.py` 里的 `mark_paid()`。接支付宝 / 微信时，在回调里验签后调用它即可。

## 管理后台和 API token

- 管理员登录后顶栏有「管理」：
  - **充电档位**：首页「每月发电」显示的档位，可以新增、编辑（名称、每月价格、权益一行一条、按钮链接、是否显示、排序）、删除。发电付款目前仍跳到爱发电。
  - **API Token**：创建时完整 token 只显示一次（库里只存哈希），可以随时吊销。
- 带上 `Authorization: Bearer <token>` 就能调 `/api/admin/...`：上下架、改特效包和技能文案、改充电档位。token **不能**创建或吊销 token，这件事只能在登录的后台里做。
- 下架（`is_published: false`）后：前台列表和详情都看不到，不能下单；已经买过的人在「我的素材」里照样能拿到链接。

```bash
# 下架
curl -X PATCH -H "Authorization: Bearer er_xxx" -H "Content-Type: application/json" \
  -d '{"is_published": false}' http://localhost:5180/api/admin/packs/fire
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/home` | 首屏 12 格、统计数字、元素列表 |
| GET | `/api/packs?element=火` | 特效包列表 |
| GET | `/api/packs/{slug}` | 详情，含技能和 4 个相关推荐 |
| POST | `/api/auth/code` | 发验证码 `{email}` |
| POST | `/api/auth/login` | 登录 `{email, code}`，写 cookie |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前用户 |
| POST | `/api/orders` | 下单 `{slugs: [...]}` |
| GET | `/api/orders`、`/api/orders/{no}` | 我的订单 |
| POST | `/api/orders/{no}/cancel` | 取消待付款订单 |
| POST | `/api/orders/{no}/mock-pay` | 模拟付款（只在 `APP_ENV=dev` 时存在） |
| GET | `/api/library` | 已购买的包和网盘链接 |
| GET | `/api/support-tiers` | 首页显示的充电档位 |
| GET | `/api/admin/packs`、`/api/admin/packs/{slug}` | 全部特效包（含下架、网盘链接）🔑 |
| PATCH | `/api/admin/packs/{slug}` | 上下架 / 改名称、价格、简介、排序、网盘链接 🔑 |
| PATCH | `/api/admin/packs/{slug}/skills/{code}` | 改技能名字、说明、动画阶段 🔑 |
| GET / POST | `/api/admin/tiers` | 充电档位列表 / 新增 🔑 |
| PATCH / DELETE | `/api/admin/tiers/{id}` | 编辑 / 删除档位 🔑 |
| GET / POST | `/api/admin/tokens`、`/api/admin/tokens/{id}/revoke` | 管理 token（只能登录的管理员） |

🔑 = 登录的管理员或 API token 都能调。完整文档：`http://localhost:8100/docs`。

## 字体

像素中文字体 Fusion Pixel（`frontend/public/fonts/`），OFL 1.1 许可，许可证文件放在同目录。
