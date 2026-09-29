/**
 * lib/util.js — Серверийн туслах функцууд
 * =====================================================================
 * HTTP хүсэлт/хариу боловсруулах, cookie задлах, id үүсгэх зэрэг
 * дахин ашиглагдах жижиг хэрэгслүүд.
 */
"use strict";
const crypto = require("crypto");
const zlib = require("zlib");

/** Хүсэлт gzip шахалт хүлээн авдаг эсэх (Accept-Encoding-д gzip байгаа, q=0 биш) */
function acceptsGzip(req) {
  const ae = req && req.headers && req.headers["accept-encoding"];
  if (!ae) return false;
  return String(ae).split(",").some((part) => {
    const bits = part.split(";").map((s) => s.trim().toLowerCase());
    if (bits[0] !== "gzip") return false;
    const q = bits.find((s) => s.startsWith("q="));
    return !q || parseFloat(q.slice(2)) > 0;
  });
}

// Үүнээс том JSON хариуг gzip-ээр шахна (жижиг хариуг шахах нь ашиггүй)
const GZIP_MIN_BYTES = 1024;

/** JSON хариу буцаах.
    Хүсэлтийг Node-ийн ServerResponse өөрөө res.req-д хадгалдаг тул дуудлагын
    гарын үсгийг өөрчлөхгүйгээр Accept-Encoding-ийг эндээс уншиж шахна. */
function sendJson(res, status, data) {
  const json = JSON.stringify(data);
  let body = Buffer.from(json === undefined ? "" : json, "utf8");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  const noBody = status === 204 || status === 304;
  if (!noBody && body.length > GZIP_MIN_BYTES) {
    headers["Vary"] = "Accept-Encoding";
    const req = res.req;
    const alreadyEncoded = typeof res.getHeader === "function" && res.getHeader("Content-Encoding");
    if (req && req.method !== "HEAD" && !alreadyEncoded && acceptsGzip(req)) {
      body = zlib.gzipSync(body);
      headers["Content-Encoding"] = "gzip";
    }
  }
  if (!noBody) headers["Content-Length"] = body.length;
  res.writeHead(status, headers);
  res.end(noBody ? undefined : body);
}

/** Алдааны хариу (Монгол мессежтэй) */
function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

/** Хүсэлтийн биеийг задлаагүй Buffer-ээр унших (хэмжээ хязгаартай).
    Хэсгүүдийг Buffer-ээр нийлүүлнэ — string-ээр нийлүүлбэл хэсгийн заагт
    таарсан кирилл (олон байттай) үсэг эвдэрнэ. Webhook-ийн гарын үсгийг
    яг энэ байтуудын эсрэг шалгадаг. */
function readRawBody(req, limit) {
  limit = limit || 1e6; // 1MB хамгаалалт
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk) => {
      if (tooBig) return;
      size += chunk.length;
      if (size > limit) { tooBig = true; req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooBig) return reject(new Error("Хэт том хүсэлт"));
      resolve(Buffer.concat(chunks));
    });
    req.on("close", () => { if (tooBig) reject(new Error("Хэт том хүсэлт")); });
    req.on("error", reject);
  });
}

/** Хүсэлтийн JSON биеийг унших (хэмжээ хязгаартай) */
async function readJsonBody(req) {
  const raw = (await readRawBody(req)).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error("JSON буруу байна");
    err.userFacing = true;
    throw err;
  }
}

/** Cookie мөрийг объект болгож задлах */
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

/** Cookie тохируулах header нэмэх */
function setCookie(res, name, value, opts) {
  opts = opts || {};
  const parts = [name + "=" + encodeURIComponent(value)];
  parts.push("Path=" + (opts.path || "/"));
  if (opts.maxAge != null) parts.push("Max-Age=" + opts.maxAge);
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  // HTTPS (Railway г.м) дээр SECURE_COOKIES=1 тохируулбал Secure нэмнэ.
  // Локал HTTP дээр (тохируулаагүй үед) албадахгүй.
  if (process.env.SECURE_COOKIES === "1") parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  const cookie = parts.join("; ");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, cookie) : cookie);
}

/** Давхцахгүй id үүсгэх */
function genId(prefix) {
  return (prefix || "id") + "_" + crypto.randomBytes(8).toString("hex");
}

/** Хүнд ойлгомжтой захиалгын код: DC-XXXXXX */
function genOrderCode() {
  const n = crypto.randomInt(0, 1e6).toString().padStart(6, "0");
  return "DC-" + n;
}

/** Тайлбар: утгыг цэвэрлэж, string болгох */
function str(v, max) {
  if (v == null) return "";
  const s = String(v).trim();
  return max ? s.slice(0, max) : s;
}

/** И-мэйл энгийн шалгалт */
function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Клиентийн IP (Railway proxy-ийн ард x-forwarded-for эхэлж) */
function clientIp(req) {
  var xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

module.exports = {
  acceptsGzip,
  sendJson,
  sendError,
  readRawBody,
  readJsonBody,
  parseCookies,
  setCookie,
  genId,
  genOrderCode,
  str,
  isEmail,
  clientIp,
};
