# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

LolTR is the team's project: a website of League of Legends mini-games with a daily challenge ("défi du jour"), friends, groups and live rankings. The team works in French, so reply in French.

The whole stack is implemented (see `README.md` for the architecture). Bun workspaces: `packages/shared` (rules, values, scoring, time, types), `packages/content` (Data Dragon data, attributes, chibis), `services/*` (auth, profil, social, jeux, classement, temps-reel), `apps/front` (React app).

Commands:
- `docker compose up -d --build`: start everything on https://localhost:8443 (needs `.env`, copy `.env.example`; `AUTH_DEV_LOGIN=true` enables test accounts).
- `bun test`: backend tests. `bun run typecheck`: services and packages. `bun run --cwd apps/front typecheck`.
- `bun run --cwd apps/front dev`: front with hot reload on http://localhost:5173, API proxied to Traefik.
- `bun run --cwd apps/front i18n:check`: French UI texts without an English translation. UI texts are written in French in components (`t("…")`) and translated in `apps/front/src/i18n/en.ts`.
- `bun run content:import` after each patch; `bun run content:check` lists champions missing hand-filled attributes.
- 3D chibis are not enabled: add GLB URLs to `MODELS_3D` (`packages/content/src/chibis.ts`); `ChibiView` handles the rest.

- Interactive mockup (Design canvas artifact): https://claude.ai/artifact/CTew1qVXiqzTKnwWgMbFBs. This is the source of truth for the UI. The whole site lives in `Main.dc.html`; the games (Champion du jour, Méli-MéLoL, Sorts éclair, Splash mystère) are separate components embedded into it. Light theme is "Porcelaine", dark theme is "Ardoise".
- Technical decision record (Claude Doc): https://claude.ai/artifact/Vb19q363fJbxE25MvKkudv

## Product philosophy

LolTR is a daily ritual, played alone or with friends, built around short League of Legends quizzes. Players come back every day for the "défi du jour" and their streak, and spend the shards they earn on chibis and skins. The mockup is the source of truth for the UI; the requirements document (cahier des charges, https://claude.ai/artifact/MQ2KwvzC6PNrd5atVq4NHr) is the source of truth for rules and values (section 17 lists what is still open). Several rules below differ from the mockup on purpose.

### Two ways to play
- **Défi du jour (daily challenge):** 4 games played back-to-back: Champion du jour every day, plus 3 games drawn daily from the eligible games (at launch: Méli-MéLoL → Sorts éclair → Splash mystère). The content is drawn at random **per player, even inside a group**, so nobody shares an answer. Only this mode earns points. It can be played solo or as a group. In a group, a recap screen after each game shows every player's points per game. Rows reorder with an animation and totals count up. A "Jeu suivant" button then waits until everyone is ready. The app goes to the recap automatically once all players have finished.
- **Classique (classic):** any game except Champion du jour can be replayed, solo or as a group, for **0 points**. Each game must first be unlocked once, then it is playable without limit. Finishing the daily challenge unlocks one game for free (the first one of the day's rotation not owned yet), two with a good performance (at least 3 of the 4 games succeeded; provisional); otherwise the Play button shows the price (500 shards per game). The daily challenge stays free: everyone plays the day's rotation. There is no free random button. In a group, if one member has unlocked a game, the whole group can play it. Content rotates so players don't get the same round twice (for example the Splash mystère splash arts).

### Games already designed
- **Champion du jour:** LoLdle-style. Guess the hidden champion; each guess compares gender, role, species, resource, range, region and release year; hints use icons or arrows in addition to colors. Daily challenge only, once per day, capped at 20 tries or 10 minutes. It no longer unlocks a chibi.
- **Méli-MéLoL:** find a champion's 4 spells in a grid of 25 icons. 30 s timer, +5 s per completed champion.
- **Sorts éclair:** a spell icon is shown; name the champion it belongs to. 30 s timer, +3 s per correct answer.
- **Splash mystère:** a real splash art (not a chibi), heavily zoomed and blurred, that reveals more after each wrong guess. The second input after the champion is the skin guess: it is not counted as a try, only one is allowed, and it is worth 30 of the 100 base points (the champion is worth 70).
- Méli-MéLoL and Sorts éclair have no start button: the board starts blurred and clears over 1 s, then the timer starts.
- Answer input: autocomplete in the site's active language, tolerant of typos and missing accents (edit distance ≤ 2 after normalization, plus an alias table); an answer is accepted in any available language.
- In group games (up to 6 players), a side panel shows teammates' progress without spoilers, plus a live ranking with row-swap animations.
- The "Jeux" page lists other planned games that are not designed yet (Portrait mystère, Chaud-Froid, Codenames de la Faille, Build Path, QCM, Sudoku LoL, etc.). The team decided to keep them displayed.

### Game contract
Every game, including the 4 existing ones, implements one shared contract so a new game ships in about a week without touching the rest of the site:
- **Manifest:** id, name, description, supported modes (solo, group, streamer), min/max players, daily-challenge eligible or not.
- **Inputs:** context (défi, classique, streamer), the round generated by the server, active language, players, accent color.
- **Server side:** round generation from a seed plus the player's history (no repeats), answer validation and timer, a scoring function (0 points outside the daily challenge).
- **Progress events:** each player's progress without revealing the answer; they feed the group panel, live ranking and streamer mode.
- **Outputs:** finished (points and details) or quit.
- **Shared building blocks** come from the site, not from each game: timer, autocomplete input, group panel, live ranking, recap.

Daily rotation: every day at 3:00 the daily challenge always includes Champion du jour, plus 3 games drawn from the other eligible games (at launch, the 3 other designed ones).

### Progression and economy
- **Points:** come only from the daily challenge. Each game is worth at most 250 points: 100 if the game is succeeded, plus up to 150 based on the player's global percentile on that game among all of the day's players (e.g. top 5% on Sorts éclair earns more of the 150). The percentile points are final at the end of the rotation (3:00); until then the UI shows a projected daily total that updates live as other players finish. Each game has its own arbitrary success threshold (Champion du jour: find the champion; Splash mystère: 70 for the champion plus 30 for the skin; Méli-MéLoL: more than 10 champions; Sorts éclair: TBD) and its own ranking metric (TBD per game). The 150 points are distributed by fixed percentile tiers (values TBD). The older per-game formulas (e.g. `max(20, 120 − 10·(tries−1))`) are replaced. Points feed two leaderboards, "mondial" (global) and "copains" (friends), both showing the current season (the today / this week / all-time buttons were dropped).
- **Ranks:** Bronze → Challenger, by percentile: Challenger top 1%, Grandmaster top 3%, Master top 6%, Diamond to Bronze TBD.
- **Daily-challenge rules:** the day changes at 3:00 (Paris), but countdowns show the player's local time. A challenge counts for the day it started and is force-closed at 3:30. Each day a player does the challenge solo OR in a group, never both; a reconnection resumes the same instance while the server timer keeps running, so going back solo is a continuation, not a second challenge.
- **Streak ("série"):** counts consecutive days played. It is shown in the header.
- **Seasons:** last 4 weeks. The leaderboard resets at the end of each season and shards are paid out.
- **Éclats (shards):** the only currency, earned and never bought.
  - From the season-end global ranking: top 10 = 600, top 100 = 350, top 1,000 = 220, top 10,000 = 180, participation (10 days played) = 40.
  - From the friends ranking: about 3× less, so friends can't farm the shop. 1st = 120, 2nd = 80, 3rd = 50, participation = 15. It only counts with at least 4 active friends.
  - Daily rewards: 10 per 500 points scored, 10 per completed daily challenge (no cap; the mockup still shows "5 max.", which the team dropped), a weekly bonus of 50 for completing at least 5 daily challenges in the week (weeks start Monday at 3:00). The mockup's 7-day streak reward (40) was dropped.
- **Chibis (47 TFT chibis plus their skins):** no longer earned; daily challenges only give shards. Chibis are bought with shards in the shop (the 30-shard "no chibi" bonus is to be confirmed). The equipped chibi is the player's avatar and **sets the accent color of the whole site**. In "aléatoire" (random) mode, the site takes the colors of the day's champion once it has been found.
- **Shop:** three tabs at the top of the view: Chibis, Skins, Prestige. Everything is bought with shards; one featured prestige skin per week; purchases are kept forever. Seasons follow the LoL calendar (Worlds, patches, champion releases) with themed rotations and limited-edition chibis.

### Social and access
- **Friends drawer:** opened from the icon next to the profile, Valorant-client style. Players add friends by pseudo (the request must be accepted; block and report are available) and create groups; members are listed first, then friends who can be invited. In a group, solo queues are locked, and hovering shows why. If a player is solo and tries a group queue, a popup offers to create a group.
- **Streamer mode:** the main acquisition channel. A streamer runs a session and viewers play along live on LolTR (every streaming platform; link or on-screen code), as guests with a random pseudo, with a "streamer vs chat" ranking and an OBS capture view that never shows the answer early. Games: the daily challenge with a different seed from the ranked one (it does not consume or reveal it), or a classic game chosen by the streamer. Each streamer gets a persistent community leaderboard; viewers get a result card ("you beat 82% of chat") and a one-click guest-to-account conversion that keeps the session's rewards; streamer-exclusive chibi badges (amounts TBD). A Twitch extension is to be built. Sessions run on the temps réel service like groups, without the 6-player cap.
- **Sharing and first visit:** a spoiler-free result card (Wordle-style hint grid plus number of tries) to copy or export as an image for Discord and X. Champion du jour is playable from the home page before any login.
- **Onboarding:** OAuth login → choose a pseudo (the app adds a tag) → pick a first chibi. The top header is hidden during these steps.
- **Tutorial:** a guided tour on first login (the presented element is highlighted, the rest of the screen dimmed, with a short text, then the next feature), and one per game on its first solo play. No tutorial during group play: the end-of-game menu offers to play a game's tutorial, which puts the player in a waiting state for their group. A skip button is always available. The tutorials can be replayed from a Settings screen (not in the mockup yet).
- **Guest mode ("Jouer hors ligne"):** the player gets a random chibi and a server-side guest ID. The day's rewards are added to the account on login, unless that account already did today's challenge (then the guest result is ignored); one device or guest ID can produce only one challenge per day. Profile, friends, shop and the friends leaderboard are unavailable to guests; clicking them opens the login popup.
- **Content source:** Riot's Data Dragon for champions, spells, skins and splash arts. Everything else (species, region, gender, release year for Champion du jour, the chibis) is completed by hand. Update the data with each patch. The Terms of Service must carry Riot's fan-content notice.
- **Data:** everything is stored server-side. No personal data is collected, only gameplay statistics (games, guesses, answers, timings, content already seen). They power personal insights ("you never recognize Shurima champions"), targeted practice in classic mode and daily global stats ("only 4% found this splash") meant for sharing.
- **Languages:** 2 for now, chosen from a dropdown in the header.

## Visual identity

Everything here is taken from the mockup (`Main.dc.html` and the 4 game components), which remains the reference.

- **Style:** angular, esports and HUD-inspired, like a game client. There are no rounded corners: shapes are cut with `clip-path` instead of `border-radius`.
  - `--cut-sm` / `--cut-md` / `--cut-lg`: top-left and bottom-right corners clipped at 10 / 20 / 40 px. Used for cards, panels, tooltips and badges.
  - `--para`: parallelogram slanted 18 px. Used for every button and CTA.
- **Typography (Google Fonts):**
  - Display: **Chakra Petch** 500–700 (`--f-d`). Titles, buttons and big numbers, uppercase with slight letter-spacing.
  - Body: **Manrope** 400–700 (`--f-b`).
  - Small labels: 12–13 px, uppercase, `letter-spacing: 0.08em`, color `--mut`. The key word of a title is highlighted with `--acc`.
- **Color tokens:** `--ink` (text), `--bg`, `--surf`, `--surf2`, `--line`, `--mut`, `--shadow`, `--acc` (accent) and `--on-acc` (text on the accent), plus the states `--ok`, `--warn` and `--danger`.
  - Dark theme "Ardoise": ink `#EEF0F3`, bg `#0F1115`, surf `#181B21`, surf2 `#21252D`, line `#343A45`, mut `#A9B0BC`. Page `body` background is `#0F1115`.
  - Light theme "Porcelaine": ink `#1A1A18`, bg `#F1F1EE`, surf `#FFFFFF`, surf2 `#ECECE8`, line `#D3D2CC`, mut `#5B5A55`.
  - States, dark / light: ok `#3DBE80` / `#2B7F55`, warn `#F2B84B` / `#A86A0C`, danger `#FF6B6B` / `#C62828`.
- **Dynamic accent:** `--acc` comes from the champion theme (`th-<champion>` class), with one value for dark mode and a darker one for light mode. Examples:
  - lux `#FFE680` / `#1D55B5`, jinx `#FF78B7` / `#B01C68`, ekko `#56E0AA` / `#0C7550`, ahri `#FF8FB8` / `#B0245E`.
  - The fallback `generic` is `#A195FF` / `#4A38C2`.
  - `neutre` (grey, `#D5D9E0` / `#2E3239`) is used on the first-visit login page.
  - The pseudo and chibi-choice onboarding steps use the yellow Lux accent.
  - After onboarding, the equipped chibi sets the accent for the whole site. Every one of the 47 chibis has its own accent pair (`ACCENTS` in `packages/content/src/chibis.ts`). In random mode, it is the day's champion once found, otherwise `generic`.
- **Backgrounds:** a radial glow in the accent color over `--bg` (`radial-gradient(..., color-mix(in srgb, var(--acc) N%, transparent), transparent 72%)`). Champion art is shown blurred and scaled behind the chibi, which is cut out on top.
- **Imagery:**
  - TFT chibis are the avatars and the main mascots.
  - Real splash arts are used only in Splash mystère.
  - Official spell and champion icons are used in the games.
  - Champion du jour shows a greyed-out placeholder until the champion is found.
- **Layout and motion:**
  - Views are designed for 1920×1080 (desktop only; a mobile version is postponed to later). Still build React components responsive from day one. Mobile path: a PWA first (installable, daily-challenge reminder notifications), then possibly an iOS/Android app with Capacitor once Riot IP rules for the stores are checked. No React Native rewrite. Each view fills at least the screen height; the leaderboard and shop pages scroll.
  - The header is sticky. Nav links get an accent underline when active. Layout (team choice, differs from the mockup): 4 tabs (Défi du jour, Jeux, Classement, Boutique), then streak, shards, friends and the avatar menu, which holds profile, settings, streamer mode, language, theme and sign-out.
  - Small, functional animations: the friends drawer slides in from the right (0.22 s), leaderboard rows swap places, point totals count up, game boards unblur over 1 s.
  - Focus style is a 2 px accent outline. Interactive targets are at least 44 px.

## Decided stack (from the decision record)

- Bun runtime, Docker Compose. The whole stack must start with a single command.
- Traefik as reverse proxy and API gateway (HTTPS, routing, forwardAuth, rate limiting).
- Microservices: auth, profil, social, jeux, classement, temps réel (WebSockets), front.
- Elysia in each backend service; React + Tailwind on the front.
- SQLite with one database file per service, accessed through Drizzle ORM.
- Redis for presence, live rankings and inter-service events (Redis Streams).

## Standing team decisions

- Authentication stays OAuth (Google/Apple/Discord) plus guest mode ("Jouer hors ligne"). Do not add email/password signup or change the login flow unless the team asks.
- Do not modify the mockup unless explicitly asked.
- Follow the infra plan above. Do not swap components on your own initiative.
- Do not touch the reference folder `/Users/ryan/Desktop/Transcendance` (a different path from this repo) until instructed.
