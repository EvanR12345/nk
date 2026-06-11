"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createServer, localNetworkUrls, normalizeScore, MAX_SCORE_DIGITS } = require("../server");

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
  theme: "fire",
  notation: "standard",
  hideLevels: false
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
    assert.equal(board.Alice.lifetime, "1234");
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
    assert.equal(user.upgrades.power, "999");
  });
});

test("scientific notation and the uncapped jjh-only exponent upgrade are normalized", async () => {
  await withServer(async base => {
    const secretResponse = await fetch(`${base}/api/leaderboard/jjh`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...player(100000),
        notation: "scientific",
        hideLevels: true,
        upgrades: { ...player(0).upgrades, exponent: "900719925474099312345678901234567890" }
      })
    });
    const secretUser = await secretResponse.json();
    assert.equal(secretUser.notation, "scientific");
    assert.equal(secretUser.hideLevels, true);
    assert.equal(secretUser.upgrades.exponent, "900719925474099312345678901234567890");

    const regularResponse = await fetch(`${base}/api/leaderboard/Alice`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...player(100000),
        notation: "unsupported",
        upgrades: { ...player(0).upgrades, exponent: 4 }
      })
    });
    const regularUser = await regularResponse.json();
    assert.equal(regularUser.notation, "standard");
    assert.equal(regularUser.upgrades.exponent, "0");
  });
});

test("lifetime values remain exact beyond JavaScript numeric limits", async () => {
  await withServer(async base => {
    const huge = "99999999999999999999999999999999999999999999999999";
    const response = await fetch(`${base}/api/leaderboard/jjh`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...player(0), count: huge, lifetime: huge })
    });
    const user = await response.json();
    assert.equal(user.count, huge);
    assert.equal(user.lifetime, huge);
  });
});


test("all upgrade levels remain exact and uncapped", async () => {
  await withServer(async base => {
    const huge = "900719925474099312345678901234567890";
    const response = await fetch(`${base}/api/leaderboard/jjh`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...player(1000),
        upgrades: { power: huge, burst: huge, combo: huge, auto: huge, exponent: huge }
      })
    });
    const user = await response.json();
    assert.deepEqual(user.upgrades, { power: huge, burst: huge, combo: huge, auto: huge, exponent: huge });
  });
});

test("scientific notation and the uncapped jjh-only exponent upgrade are normalized", async () => {
  await withServer(async base => {
    const secretResponse = await fetch(`${base}/api/leaderboard/jjh`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...player(100000),
        notation: "scientific",
        hideLevels: true,
        upgrades: { ...player(0).upgrades, exponent: "900719925474099312345678901234567890" }
      })
    });
    const secretUser = await secretResponse.json();
    assert.equal(secretUser.notation, "scientific");
    assert.equal(secretUser.hideLevels, true);
    assert.equal(secretUser.upgrades.exponent, "900719925474099312345678901234567890");

    const regularResponse = await fetch(`${base}/api/leaderboard/Alice`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...player(100000),
        notation: "unsupported",
        upgrades: { ...player(0).upgrades, exponent: 4 }
      })
    });
    const regularUser = await regularResponse.json();
    assert.equal(regularUser.notation, "standard");
    assert.equal(regularUser.upgrades.exponent, "0");
  });
});

test("lifetime values remain exact beyond JavaScript numeric limits", async () => {
  await withServer(async base => {
    const huge = "99999999999999999999999999999999999999999999999999";
    const response = await fetch(`${base}/api/leaderboard/jjh`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...player(0), count: huge, lifetime: huge })
    });
    const user = await response.json();
    assert.equal(user.count, huge);
    assert.equal(user.lifetime, huge);
  });
});


test("local network URLs include only external IPv4 addresses", () => {
  const interfaces = {
    lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
    wifi: [{ family: "IPv4", address: "192.168.1.42", internal: false }],
    docker: [{ family: "IPv4", address: "172.17.0.1", internal: false }],
    ipv6: [{ family: "IPv6", address: "fe80::1", internal: false }]
  };

  assert.deepEqual(localNetworkUrls(3000, interfaces), [
    "http://192.168.1.42:3000",
    "http://172.17.0.1:3000"
  ]);
});


test("scores larger than the browser-safe limit are saturated", () => {
  const oversized = "8".repeat(MAX_SCORE_DIGITS + 1);
  const normalized = normalizeScore(oversized);

  assert.equal(normalized.length, MAX_SCORE_DIGITS);
  assert.equal(normalized, "9".repeat(MAX_SCORE_DIGITS));
});

test("API bounds oversized scores before returning them to clients", async () => {
  await withServer(async base => {
    const oversized = "8".repeat(MAX_SCORE_DIGITS + 1);
    const response = await fetch(`${base}/api/leaderboard/Giant`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...player(0), count: oversized, lifetime: oversized })
    });
    const user = await response.json();

    assert.equal(response.status, 200);
    assert.equal(user.count.length, MAX_SCORE_DIGITS);
    assert.equal(user.lifetime.length, MAX_SCORE_DIGITS);
  });
});
