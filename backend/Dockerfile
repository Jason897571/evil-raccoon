# 后端：FastAPI + uvicorn。启动时先跑数据库迁移再起服务。
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# 先只装依赖，代码改动时可复用这一层缓存
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./

# 非 root 运行；media 目录挂卷，用来存收款码等上传文件
RUN useradd --uid 1000 --create-home appuser && mkdir -p /app/media && chown -R appuser /app/media
USER appuser

EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8100/api/health', timeout=4).status == 200 else 1)"

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8100 --proxy-headers --forwarded-allow-ips='*'"]
