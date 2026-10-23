# LolTR — raccourcis. `make help` liste les cibles.
# Sous Windows, lancer depuis Git Bash (ou `choco install make`).
COMPOSE := docker compose
COMPOSE_DEV := docker compose -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL := help

.PHONY: help env install up up-dev down restart rebuild rebuild-dev logs ps test typecheck i18n content-import content-check front-dev clean nuke

help: ## Liste les cibles
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

env: ## Crée .env depuis .env.example s'il manque
	@if [ ! -f .env ]; then cp .env.example .env; echo ".env créé — renseigne INTERNAL_TOKEN (et AUTH_DEV_LOGIN=true pour tester sans OAuth)."; else echo ".env déjà présent."; fi

install: ## Installe les dépendances (bun)
	bun install

up: env ## Démarre toute la stack prod (https://localhost:8443)
	$(COMPOSE) up -d --build

up-dev: env ## Démarre la stack avec le front en hot reload (aucun rebuild à chaque changement)
	$(COMPOSE_DEV) up -d --build

down: ## Arrête la stack (garde les données)
	$(COMPOSE) down

restart: ## Redémarre la stack
	$(COMPOSE) restart

rebuild: ## Rebuild un service : make rebuild SERVICE=jeux
	$(COMPOSE) up -d --build $(SERVICE)

rebuild-dev: ## Rebuild un service en mode dev : make rebuild-dev SERVICE=front
	$(COMPOSE_DEV) up -d --build $(SERVICE)

logs: ## Logs temps réel : make logs SERVICE=front (vide = tous)
	$(COMPOSE) logs -f $(SERVICE)

ps: ## État des conteneurs
	$(COMPOSE) ps

test: ## Tests backend
	bun test

typecheck: ## Vérifie les types (services + front)
	bun run typecheck
	bun run --cwd apps/front typecheck

i18n: ## Textes FR sans traduction EN
	bun run --cwd apps/front i18n:check

content-import: ## Réimporte les données Data Dragon (à chaque patch)
	bun run content:import

content-check: ## Champions sans attributs remplis à la main
	bun run content:check

front-dev: ## Front local avec hot reload (http://localhost:5173, nécessite bun)
	bun run --cwd apps/front dev

clean: ## Arrête la stack et supprime les conteneurs (garde les données)
	$(COMPOSE) down

nuke: ## ATTENTION : arrête tout et supprime aussi les volumes (SQLite, redis)
	$(COMPOSE) down -v
