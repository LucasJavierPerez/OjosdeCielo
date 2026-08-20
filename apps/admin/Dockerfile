# Panel de la clínica. Se construye desde la raíz del repo:
#   docker build -f apps/admin/Dockerfile .
#
# En Railway: Root Directory = / y Dockerfile Path = apps/admin/Dockerfile.

FROM node:24-alpine AS build
WORKDIR /repo

# Las VITE_* se hornean en el bundle durante el build; no son variables de
# runtime. Si faltan acá, la app compila igual y falla recién en el navegador
# al no encontrar a dónde conectarse. Railway pasa las variables del servicio
# como build args, así que alcanza con definirlas en el panel.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN corepack enable

# Primero los manifiestos: si no cambian, Docker reutiliza la capa de install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/admin/package.json apps/admin/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

# Railway a veces reutiliza esta capa aunque el código haya cambiado —el
# build queda "successful" pero sirve el bundle de un commit anterior—.
# RAILWAY_GIT_COMMIT_SHA la inyecta Railway solo y cambia en cada push, así
# que referenciarla antes del COPY obliga a rehacer el resto desde acá.
ARG RAILWAY_GIT_COMMIT_SHA
RUN echo "commit ${RAILWAY_GIT_COMMIT_SHA}" > /tmp/build-commit

COPY . .
RUN pnpm --filter @ojosdecielo/admin build

# ---------------------------------------------------------------------------
# Servido
#
# Caddy y no un servidor de Node: son archivos estáticos, y meter un runtime
# entero para servirlos es peso y superficie de ataque de más.
# ---------------------------------------------------------------------------
FROM caddy:2-alpine
COPY --from=build /repo/apps/admin/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
