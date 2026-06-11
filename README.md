# neekelijah.com

A dependency-free browser clicker with a persistent, cross-device leaderboard.

## Run locally

Node.js 20 or newer is required.

```bash
npm start
```

Open <http://localhost:3000> on each device. Every device connected to the same deployed server reads and writes the same leaderboard.

## Deploy

Deploy this repository as a **Node web service**, not as a static-only site. The host should run:

```bash
npm start
```

The server uses `PORT` when supplied by the host. Leaderboard data defaults to `data/leaderboard.json`; set `DATA_FILE` to a path on a persistent disk/volume in production:

```bash
DATA_FILE=/var/lib/neekelijah/leaderboard.json npm start
```

If the API is temporarily unreachable, the browser keeps progress in `localStorage` and retries the shared leaderboard automatically.
