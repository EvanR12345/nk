# neekelijah.com

A dependency-free browser clicker with persistent, cross-device progress and a shared leaderboard.

## Run locally

Node.js 20 or newer is required.

```bash
npm start
```

On the computer, open <http://localhost:3000>.

To use the game from a phone on the same Wi-Fi network:

1. Start the server with `npm start` and leave that terminal open.
2. Look for the `Open on your phone: http://...:3000` address printed in the terminal.
3. Open that address on the phone. Do **not** use `localhost` on the phone, because that means the phone itself.
4. Enter the same username on both devices. Username capitalization is matched automatically.

Your computer firewall must allow incoming connections to Node.js on port `3000`. Set `HOST` or `PORT` when a different bind address or port is needed:

```bash
HOST=0.0.0.0 PORT=8080 npm start
```

Local-network access works only while the computer is running the server and both devices are on the same reachable network. For access away from home, deploy the app to a web host.

## Deploy

Deploy this repository as a **Node web service**, not as a static-only site. The host should run:

```bash
npm start
```

The server uses `PORT` and `HOST` when supplied by the host. Leaderboard and account data default to `data/leaderboard.json`; set `DATA_FILE` to a path on a persistent disk/volume in production:

```bash
DATA_FILE=/var/lib/neekelijah/leaderboard.json npm start
```

Open the same deployed URL and enter the same username on every device. A static-only deployment cannot synchronize scores because it does not run the `/api/leaderboard` server. If that API is temporarily unreachable, the browser keeps progress in `localStorage` and retries shared synchronization automatically.
