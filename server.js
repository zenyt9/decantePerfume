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

// Cache-busting хувилбар: сервер эхлэх бүрд (redeploy болгонд) шинэчлэгдэнэ.
// HTML доторх css/js/assets линкүүдэд ?v=BUILD_ID нэмснээр хуучин кэш арилна.
const BUILD_ID = Date.now().toString(36);

/* Аюулгүй байдлын толгойнууд (бүх хариуд) */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://connect.facebook.net",
  "frame-src https://www.facebook.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

/* Брэндтэй 404 хуудас (эхлэхэд нэг уншина) */
let NOT_FOUND_HTML = "404 — Хуудас олдсонгүй";
try { NOT_FOUND_HTML = fs.readFileSync(path.join(ROOT, "404.html"), "utf8"); } catch (e) {}
function send404(res) {
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(NOT_FOUND_HTML);
}

/* Аюулгүй байдал: зөвхөн эдгээр газраас статик файл түгээнэ.
   (data/, lib/, server.js, db.json зэрэг хэзээ ч задрахгүй.) */
const STATIC_ALLOW = /^\/(css|js|assets)\//;
const STATIC_FILES = new Set([
  "/index.html", "/admin.html", "/favicon.ico",
  "/robots.txt", "/sitemap.xml",
]);

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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
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
    return send404(res);
  }

  // Зөвшөөрөгдсөн эсэхийг шалгах
  if (!STATIC_FILES.has(rel) && !STATIC_ALLOW.test(rel)) {
    return send404(res);
  }

  const filePath = path.resolve(ROOT, "." + rel);
  const safe = path.relative(ROOT, filePath);
  if (safe.startsWith("..") || path.isAbsolute(safe)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send404(res);
    }
    const ext = path.extname(filePath);
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };

    if (ext === ".html") {
      // HTML-ийг үргэлж шинэ авна; локал css/js/assets линкүүдэд ?v=BUILD_ID шигтгэнэ
      data = Buffer.from(
        String(data).replace(
          /(href|src)="((?:css|js|assets)\/[^"?]+)"/g,
          '$1="$2?v=' + BUILD_ID + '"'
        ),
        "utf8"
      );
      headers["Cache-Control"] = "no-cache";
    } else if (/[?&]v=/.test(req.url)) {
      // Хувилбартай (?v=BUILD_ID) статик файл — нэг удаа татаж удаан кэшилнэ.
      // Шинэ deploy бүрд ?v өөрчлөгдөж шинэ URL болно (кэш автоматаар шинэчлэгдэнэ).
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    } else {
      // Хувилбаргүй шууд дуудлага — үргэлж дахин шалгаж, хуучин кэшэнд гацахгүй.
      headers["Cache-Control"] = "no-cache";
    }

    res.writeHead(200, headers);
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/*  Сервер                                                             */
/* ------------------------------------------------------------------ */
ensureSeeded();

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
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
