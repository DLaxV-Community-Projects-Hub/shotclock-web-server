# shotclock-web-server

Server for the shot clock application built with NodeJS

## Developing

Once you've cloned the project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev
```

## Configuration

| Variable      | Default  | Description                                                              |
| ------------- | -------- | ------------------------------------------------------------------------ |
| `PORT`        | `8080`   | Port of the WebSocket server                                             |
| `DATA_DIR`    | `./data` | Directory of the SQLite database in which rooms are persisted            |
| `TRUST_PROXY` | `false`  | Use the last `X-Forwarded-For` entry as client IP (behind a reverse proxy) |

Rooms survive restarts (they come back paused) and are deleted after 24 hours without use.
When running with Docker, the database is stored in `./data` next to `docker-compose.yml`.
The directory must be writable by the container user (`mkdir data && chown 1000:1000 data`).
