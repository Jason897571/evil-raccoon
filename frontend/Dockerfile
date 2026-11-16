# 前端：nginx 提供静态文件，/api 转给后端，/media 直接读共享卷。
# dist 由 scripts/deploy.sh 先在本机 `npm run build` 生成（纯静态文件，和 CPU 架构无关），
# 镜像里不跑 node，省掉拉 node 基础镜像和模拟 amd64 构建的时间。
ARG NGINX_IMAGE=nginx:1.27-alpine
FROM ${NGINX_IMAGE}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 80
