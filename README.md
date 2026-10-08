# Pager

An open-source, self-hostable unified messenger. One account, all your chats, running on your own
Matrix server with bridges. Think Beeper, but yours.

**Status:** early. The server stack in `server/` is scaffolded but untested; the API and app are not started.

## Layout
- `server/` – Synapse + Postgres + Caddy + mautrix bridges (docker compose)
- `api/` – (planned) signup and in-app bridge login service
- `app/` – (planned) the Pager client

## Server quick start
Requires Docker and a domain pointing at the host.
```bash
cd server
./scripts/setup.sh
docker compose up -d
```
