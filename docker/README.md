# Docker workspace layout

This directory contains the new monorepo-focused Docker workflow for development, production, and test environments.

## Commands

- Development: `docker compose -f docker/compose.base.yml -f docker/compose.dev.yml up --build`
- Production: `docker compose -f docker/compose.base.yml -f docker/compose.prod.yml up --build`
- Test: `docker compose -f docker/compose.base.yml -f docker/compose.test.yml up --build`
