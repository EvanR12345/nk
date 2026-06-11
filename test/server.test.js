"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createServer } = require("../server");

async function withServer(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "neek-leaderboard-"));
  const server = createServer({ dataFile: path.join(directory, "leaderboard.json") });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const player = lifetime => ({
  count: lifetime,
  lifetime,
  world: 2,
  bestCombo: 20,
  upgrades: { power: 2, burst: 3, combo: 4, auto: 1 },
  achievements: { first: Date.now() },
  theme: "fire"
});

test("leaderboard changes are visible to separate clients", async () => {
  await withServer(async base => {
    const firstDevice = await fetch(`${base}/api/leaderboard/Alice`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(player(1234))
    });
    assert.equal(firstDevice.status, 200);

    const secondDevice = await fetch(`${base}/api/leaderboard`);
    assert.equal(secondDevice.status, 200);
    const board = await secondDevice.json();
    assert.equal(board.Alice.lifetime, 1234);
    assert.equal(board.Alice.theme, "fire");
  });
});

test("concurrent player updates do not overwrite each other", async () => {
  await withServer(async base => {
    await Promise.all(["Alice", "Bob", "Carol"].map((name, index) => fetch(`${base}/api/leaderboard/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(player((index + 1) * 100))
    })));

    const board = await (await fetch(`${base}/api/leaderboard`)).json();
    assert.deepEqual(Object.keys(board).sort(), ["Alice", "Bob", "Carol"]);
  });
});

test("API rejects invalid users and oversized values are normalized", async () => {
  await withServer(async base => {
    const invalid = await fetch(`${base}/api/leaderboard/x`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(invalid.status, 400);

    const reserved = await fetch(`${base}/api/leaderboard/__proto__`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(player(10))
    });
    assert.equal(reserved.status, 400);

    const saved = await fetch(`${base}/api/leaderboard/Valid`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...player(10), world: 999, upgrades: { power: 999 } })
    });
    const user = await saved.json();
    assert.equal(user.world, 100);
    assert.equal(user.upgrades.power, 100);
  });
});
