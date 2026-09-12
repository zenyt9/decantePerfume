/**
 * server.js — Décante вебсайтын үндсэн сервер
 * =====================================================================
 * • Статик файл (frontend) түгээнэ
 * • /api/... хүсэлтийг REST API руу дамжуулна
 * • Нэмэлт npm сан ШААРДАХГҮЙ — зөвхөн Node.js-ийн built-in модулиуд.
 *
 * Ажиллуулах:  node server.js   →   http://localhost:4173
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const { ensureSeeded } = require("./lib/seed");
const { handleApi } = require("./lib/api");

const ROOT = path.resolve(__dirname);
const PORT = process.env.PORT || 4173;

/* Аюулгүй байдал: зөвхөн эдгээр газраас статик файл түгээнэ.
   (data/, lib/, server.js, db.json зэрэг хэзээ ч задрахгүй.) */
const STATIC_ALLOW = /^\/(css|js|assets)\//;
const STATIC_FILES = new Set(["/index.html", "/admin.html", "/favicon.ico"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/* ------------------------------------------------------------------ */
/*  Статик файл түгээх                                                 */
/* ------------------------------------------------------------------ */
function serveStatic(req, res, pathname) {
  // Замын хувиргалт
  let rel = pathname;
  if (rel === "/") rel = "/index.html";
  else if (rel === "/admin" || rel === "/admin/") rel = "/admin.html";

  // Path traversal хамгаалалт: pathname нь decodeURIComponent хийгдсэн тул
  // "%2e%2e%2f" мэт кодлол ".." болж задарсан байж болно. Ийм замыг эндээс
  // татгалзана — allowlist regex болон path.relative шалгалт зөвхөн ROOT-оос
  // ГАДАГШ гарахыг хориглодог тул ROOT доторх бусад файл (data/, lib/) руу
  // "/assets/../lib/seed.js" мэтээр орохоос сэргийлнэ.
  if (rel.indexOf("..") !== -1 || rel.indexOf("\0") !== -1) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 — олдсонгүй");
  }

  // Зөвшөөрөгдсөн эсэхийг шалгах
  if (!STATIC_FILES.has(rel) && !STATIC_ALLOW.test(rel)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 — олдсонгүй");
  }

  const filePath = path.resolve(ROOT, "." + rel);
  const safe = path.relative(ROOT, filePath);
  if (safe.startsWith("..") || path.isAbsolute(safe)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 — олдсонгүй: " + rel);
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/*  Сервер                                                             */
/* ------------------------------------------------------------------ */
ensureSeeded();

const server = http.createServer((req, res) => {
  let parsed;
  try {
    parsed = new URL(req.url, "http://localhost");
  } catch (e) {
    res.writeHead(400);
    return res.end("Bad request");
  }
  const pathname = decodeURIComponent(parsed.pathname);
  const query = Object.fromEntries(parsed.searchParams);

  if (pathname.startsWith("/api/")) {
    return handleApi(req, res, pathname, query);
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log("");
  console.log("  Décante сервер аслаа →  http://localhost:" + PORT);
  console.log("  Дэлгүүр:      http://localhost:" + PORT + "/");
  console.log("  Админ самбар: http://localhost:" + PORT + "/admin");
  console.log("");
});
