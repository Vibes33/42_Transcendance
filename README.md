# LolTR

A website of League of Legends mini-games built around a daily challenge ("défi du jour"): Champion of the day plus 3 games drawn each day, played solo or with a party of up to 6 friends, with live rankings, seasons, shards, a shop of TFT chibis and a streamer mode.

## Quick start

Requirements: Docker (with Compose) and, for local development, [Bun](https://bun.sh) 1.4.

```bash
cp .env.example .env
```

Set `INTERNAL_TOKEN` to a long random value. For local testing without OAuth, set `AUTH_DEV_LOGIN=true` (a "test account" field appears on the sign-in page). Fill the Google / Discord / Apple credentials to enable those providers; a provider without credentials is shown disabled.

```bash
docker compose up -d --build
```

Open https://localhost:8443 (self-signed certificate generated on first start).

## Architecture

Traefik is the single entry point (HTTPS, routing, rate limiting). Every API call goes through a `forwardAuth` middleware that asks the `auth` service who the caller is; Traefik strips identity headers sent by clients and forwards the verified ones (`x-user-id`, `x-user-kind`, `x-device-id`).

| Service | Path | Role |
| --- | --- | --- |
| `front` | `/` | React 19 + Vite + Tailwind 4 single-page app, served by Bun |
| `auth` | `/api/auth` | OAuth (Google, Apple, Discord via arctic), guest sessions, session cookie, guest → account merge. No personal data: only a SHA-256 of `provider:subject` |
| `profil` | `/api/profil` | Nickname + tag, preferences, equipped chibi, tutorials |
| `social` | `/api/social` | Friends (requests must be accepted), blocks, reports, parties (6 max) |
| `jeux` | `/api/jeux` | Daily rotation, round generation, answer validation and server-side timers for every game, image proxy that hides answers |
| `classement` | `/api/classement` | Points (100 base + up to 150 by percentile tier), leaderboards, ranks, streaks, seasons, shards ledger, shop |
| `temps-reel` | `/ws`, `/api/temps-reel` | WebSocket presence and notifications, party sessions (recap + ready barrier, disconnect / rejoin), streamer sessions and OBS view |

Each backend service uses Elysia and its own SQLite file through Drizzle ORM. Services talk through Redis Streams events (`round.finished`, `friend.request`, `user.merged`…) and a few internal HTTP routes protected by `INTERNAL_TOKEN`.

```
packages/shared    rules and values, time (3:00 Paris day change), scoring, typo-tolerant matching, shared types, events, HTTP helpers
packages/content   Data Dragon import, hand-filled champion attributes, chibis catalogue (3D model registry: MODELS_3D)
services/*         backend microservices
apps/front         web app (pages, games, i18n fr/en)
traefik/           static and dynamic configuration
```

### Adding a game

Implement the server engine (`services/jeux/src/games/<game>.ts`: create, act, isOver, finish, result, reveal, progress) and register it in `games/index.ts`; add its manifest in `packages/shared/src/rules.ts`; add the UI component and tutorial in `apps/front/src/games/index.ts`. Timer, answer input, live ranking, recap and end dialog are shared building blocks.

### 3D chibis

Not enabled yet. To show a chibi in 3D, add its GLB URL to `MODELS_3D` in `packages/content/src/chibis.ts` and place the `model-viewer` script at `apps/front/public/vendor/model-viewer.min.js`; `ChibiView` switches to 3D automatically.

## Development

```bash
bun install
bun test                         # backend tests
bun run typecheck                # services and packages
bun run --cwd apps/front typecheck
bun run --cwd apps/front i18n:check   # French texts missing an English translation
bun run content:import           # refresh champions from Data Dragon (each patch)
bun run content:check            # champions missing hand-filled attributes
```

Front with hot reload against the running stack: `bun run --cwd apps/front dev` (http://localhost:5173, API proxied to Traefik).

Front with hot reload and zero rebuilds (no Bun needed on the host, page served on https://localhost:8443 as usual):
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` — every save under `apps/front/src` or `packages/*` reloads automatically.

## Legal

LolTR isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
