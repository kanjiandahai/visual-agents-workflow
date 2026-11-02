#!/usr/bin/env node
/**
 * Optional local SSE bridge for visual-agents-workflow.
 *   GET  /events  — Server-Sent Events stream
 *   POST /emit    — push one JSON event { ts?, agent, type, message, edge?, state?, activeNodes? }
 *   GET  /health  — { ok, clients, events }
 * Also serves ../docs as static files on the same port.
 *
 * Usage:
 *   node server/sse-server.js
 *   PORT=8787 node server/sse-server.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = path.resolve(__dirname, "..", "docs");
const MAX_HISTORY = 200;

/** @type {Set<import('http').ServerResponse>} */
const clients = new Set();
/** @type {object[]} */
const history = [];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalizeEvent(raw) {
  const ev = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!ev || typeof ev !== "object") throw new Error("event must be an object");
  return {
    ts: ev.ts || new Date().toISOString(),
    agent: String(ev.agent || "system"),
    type: String(ev.type || "message"),
    message: String(ev.message || ""),
    edge: ev.edge || null,
    state: ev.state || null,
    activeNodes: Array.isArray(ev.activeNodes) ? ev.activeNodes : null,
  };
}

function broadcast(ev) {
  history.push(ev);
  if (history.length > MAX_HISTORY) history.shift();
  const payload = `event: agent\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function attachSSE(req, res) {
  cors(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(`event: agent\ndata: ${JSON.stringify({
    ts: new Date().toISOString(),
    agent: "system",
    type: "status",
    message: "SSE connected",
  })}\n\n`);
  // replay recent history so late joiners see context
  for (const ev of history.slice(-40)) {
    res.write(`event: agent\ndata: ${JSON.stringify(ev)}\n\n`);
  }
  clients.add(res);
  const keep = setInterval(() => {
    try {
      res.write(":keepalive\n\n");
    } catch {
      clearInterval(keep);
    }
  }, 15000);
  req.on("close", () => {
    clearInterval(keep);
    clients.delete(res);
  });
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split("?")[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

async function serveStatic(req, res, pathname) {
  let filePath = safeJoin(ROOT, pathname === "/" ? "/index.html" : pathname);
  if (!filePath) return sendJson(res, 400, { error: "bad path" });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(res, 404, { error: "not found" });
  }
  const ext = path.extname(filePath).toLowerCase();
  cors(res);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const { pathname } = url;

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      clients: clients.size,
      events: history.length,
    });
  }

  if (req.method === "GET" && pathname === "/events") {
    return attachSSE(req, res);
  }

  if (req.method === "POST" && pathname === "/emit") {
    try {
      const body = await readBody(req);
      const ev = normalizeEvent(body || "{}");
      broadcast(ev);
      return sendJson(res, 200, { ok: true, event: ev, clients: clients.size });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: String(err.message || err) });
    }
  }

  if (req.method === "GET") {
    return serveStatic(req, res, pathname);
  }

  sendJson(res, 405, { error: "method not allowed" });
});

server.listen(PORT, HOST, () => {
  console.log(`[sse] listening http://${HOST}:${PORT}`);
  console.log(`[sse] sandbox  http://${HOST}:${PORT}/`);
  console.log(`[sse] stream   http://${HOST}:${PORT}/events`);
  console.log(`[sse] emit     POST http://${HOST}:${PORT}/emit`);
});
