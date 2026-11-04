#!/usr/bin/env node
// Minimaler Server ohne Abhängigkeiten:
//  - liefert die App (statische Dateien) aus
//  - speichert verschlüsselte Sync-Daten unter /api/sync/<raum-id>
//
// Umgebungsvariablen: PORT (Standard 8080), HOST (Standard 0.0.0.0),
// DATA_DIR (Standard ./data), CORS_ORIGIN (Standard *)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_BODY = 5 * 1024 * 1024;

const STATIC = new Set(['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'sw.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readRoom(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function handleSync(req, res, roomId) {
  const file = path.join(DATA_DIR, `${roomId}.json`);
  if (req.method === 'GET') {
    const room = readRoom(file);
    return send(res, 200, room || { version: 0 }, { 'Cache-Control': 'no-store' }); // version 0 = noch leer
  }
  if (req.method === 'PUT') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.status || 400, { error: 'invalid body' }); }
    if (typeof body?.iv !== 'string' || typeof body?.data !== 'string' || !Number.isInteger(body.baseVersion)) {
      return send(res, 400, { error: 'invalid body' });
    }
    // Ab hier synchron → keine Wettläufe innerhalb dieses Prozesses.
    const current = readRoom(file);
    const currentVersion = current?.version || 0;
    if (body.baseVersion !== currentVersion) return send(res, 409, { error: 'conflict', version: currentVersion });
    const room = { version: currentVersion + 1, iv: body.iv, data: body.data, updatedAt: new Date().toISOString() };
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(room));
    fs.renameSync(tmp, file);
    return send(res, 200, { version: room.version });
  }
  return send(res, 405, { error: 'method not allowed' });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const allowed = STATIC.has(rel) || /^js\/[\w-]+\.js$/.test(rel);
  if (!allowed) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  fs.readFile(path.join(ROOT, rel), (err, buf) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    send(res, 200, buf, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') return send(res, 204, '');
      const m = pathname.match(/^\/api\/sync\/([a-f0-9]{64})$/);
      if (m) return await handleSync(req, res, m[1]);
      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, pathname);
    } catch (e) {
      console.error(e);
      send(res, 500, { error: 'server error' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Peptid-Kalender läuft auf http://localhost:${PORT} (Daten: ${DATA_DIR})`);
  });
}
