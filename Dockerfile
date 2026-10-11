FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# 일부러 없는 파일을 복사해 빌드를 실패시킨다 (빌드 실패 감지·AI 수정 시연용)
COPY server.js does-not-exist.txt ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
