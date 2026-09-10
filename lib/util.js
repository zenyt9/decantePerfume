/**
 * lib/util.js — Серверийн туслах функцууд
 * =====================================================================
 * HTTP хүсэлт/хариу боловсруулах, cookie задлах, id үүсгэх зэрэг
 * дахин ашиглагдах жижиг хэрэгслүүд.
 */
"use strict";
const crypto = require("crypto");

/** JSON хариу буцаах */
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** Алдааны хариу (Монгол мессежтэй) */
function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

/** Хүсэлтийн JSON биеийг унших (хэмжээ хязгаартай) */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) { // 1MB хамгаалалт
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) return reject(new Error("Хэт том хүсэлт"));
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("JSON буруу байна"));
      }
    });
    req.on("error", reject);
  });
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

module.exports = {
  sendJson,
  sendError,
  readJsonBody,
  parseCookies,
  setCookie,
  genId,
  genOrderCode,
  str,
  isEmail,
};
