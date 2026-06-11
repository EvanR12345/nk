"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const DEFAULT_DATA_FILE = path.join(ROOT, "data", "leaderboard.json");
const MAX_BODY_BYTES = 64 * 1024;
const MAX_USERS = 10000;

function cleanUser(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const upgrades = value.upgrades && typeof value.upgrades === "object" ? value.upgrades : {};
  const achievements = value.achievements && typeof value.achievements === "object" ? value.achievements : {};
  const count = Math.max(0, Number(value.count) || 0);
  const lifetime = Math.max(count, Number(value.lifetime) || count);

  return {
    count,
    lifetime,
    world: Math.min(100, Math.max(1, Number(value.world) || 1)),
    bestCombo: Math.max(0, Number(value.bestCombo) || 0),
    createdAt: Number(value.createdAt) || Date.now(),
    lastSeen: Date.now(),
    upgrades: {
      power: Math.min(100, Math.max(1, Number(upgrades.power) || 1)),
      burst: Math.min(100, Math.max(1, Number(upgrades.burst) || 1)),
      combo: Math.min(100, Math.max(1, Number(upgrades.combo) || 1)),
      auto: Math.min(100, Math.max(0, Number(upgrades.auto) || 0)),
      exponent: name === "jjh" ? Math.max(0, Math.floor(Number(upgrades.exponent) || 0)) : 0
    },
    achievements: Object.fromEntries(
      Object.entries(achievements).slice(0, 100).map(([key, unlockedAt]) => [String(key).slice(0, 40), Number(unlockedAt) || Date.now()])
    ),
    theme: ["neon", "fire", "ice", "toxic"].includes(value.theme) ? value.theme : "neon",
    notation: value.notation === "scientific" ? "scientific" : "standard"
  };
}

function validUsername(name) {
  const reserved = new Set(["__proto__", "prototype", "constructor"]);
  return typeof name === "string" && name.length >= 2 && name.length <= 16 &&
    !/[\u0000-\u001f]/.test(name) && !reserved.has(name.toLowerCase());
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function createLeaderboardStore(dataFile = DEFAULT_DATA_FILE) {
  let writeQueue = Promise.resolve();

  async function read() {
    try {
      const value = JSON.parse(await fs.readFile(dataFile, "utf8"));
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return {};
      throw error;
    }
  }

  function put(name, user) {
    const operation = writeQueue.then(async () => {
      const users = await read();
      if (!users[name] && Object.keys(users).length >= MAX_USERS) {
        throw Object.assign(new Error("Leaderboard is full"), { statusCode: 507 });
      }
      users[name] = user;
      await fs.mkdir(path.dirname(dataFile), { recursive: true });
      const temporary = `${dataFile}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(users), "utf8");
      await fs.rename(temporary, dataFile);
      return user;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return { read, put };
}

function createServer(options = {}) {
  const store = createLeaderboardStore(options.dataFile);

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/leaderboard" && req.method === "GET") {
        return json(res, 200, await store.read());
      }

      if (url.pathname.startsWith("/api/leaderboard/") && req.method === "PUT") {
        const name = decodeURIComponent(url.pathname.slice("/api/leaderboard/".length));
        if (!validUsername(name)) return json(res, 400, { error: "Invalid username" });
        const user = cleanUser(await readBody(req), name);
        if (!user) return json(res, 400, { error: "Invalid user data" });
        return json(res, 200, await store.put(name, user));
      }

      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Method not allowed" });
      const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(ROOT, requested);
      if (file !== path.join(ROOT, "index.html")) return json(res, 404, { error: "Not found" });
      const content = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": content.length,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
      });
      if (req.method === "HEAD") return res.end();
      res.end(content);
    } catch (error) {
      if (error instanceof SyntaxError) return json(res, 400, { error: "Invalid JSON" });
      json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Internal server error" });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const dataFile = process.env.DATA_FILE || DEFAULT_DATA_FILE;
  createServer({ dataFile }).listen(port, () => console.log(`neekelijah.com listening on http://localhost:${port}`));
}

module.exports = { createServer, cleanUser, validUsername };
