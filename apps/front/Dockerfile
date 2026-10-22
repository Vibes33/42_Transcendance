# Front React : construit avec Vite, servi par un petit serveur Bun.
FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
COPY services/auth/package.json services/auth/
COPY services/profil/package.json services/profil/
COPY services/social/package.json services/social/
COPY services/jeux/package.json services/jeux/
COPY services/classement/package.json services/classement/
COPY services/temps-reel/package.json services/temps-reel/
COPY apps/front/package.json apps/front/
RUN bun install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/front ./apps/front
RUN cd apps/front && bun run build

FROM oven/bun:1.4.3
WORKDIR /app
COPY --from=build /app/apps/front/dist ./dist
COPY apps/front/serve.ts ./serve.ts
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD bun -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "serve.ts"]
