/**
 * lib/otp.js — Нэг удаагийн код (OTP) ба rate-limit
 * =====================================================================
 * Код болон хязгаарлалтыг санах ойд хадгална (богино насттай тул хангалттай).
 * Кодыг ил хадгалахгүй — зөвхөн hash-ийг хадгална.
 */
"use strict";
const crypto = require("crypto");

var otps = new Map(); // key -> { hash, expiresAt, attempts }
var rl = new Map();   // key -> { count, resetAt, last }

var OTP_TTL = 10 * 60 * 1000;  // 10 минут
var OTP_MAX_ATTEMPTS = 5;

function keyFor(purpose, email) {
  return purpose + ":" + String(email || "").toLowerCase();
}
function hashCode(code, k) {
  return crypto.createHash("sha256").update(code + "|" + k).digest("hex");
}

/** 6 оронтой код үүсгэж хадгална, кодыг буцаана */
function generateOtp(purpose, email) {
  var k = keyFor(purpose, email);
  var code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  otps.set(k, { hash: hashCode(code, k), expiresAt: Date.now() + OTP_TTL, attempts: 0 });
  return code;
}

/** Кодыг шалгана. { ok, reason } буцаана. Амжилттай бол кодыг устгана. */
function verifyOtp(purpose, email, code) {
  var k = keyFor(purpose, email);
  var rec = otps.get(k);
  if (!rec) return { ok: false, reason: "Код олдсонгүй. Дахин код авна уу." };
  if (Date.now() > rec.expiresAt) { otps.delete(k); return { ok: false, reason: "Кодын хугацаа дууссан." }; }
  rec.attempts++;
  if (rec.attempts > OTP_MAX_ATTEMPTS) { otps.delete(k); return { ok: false, reason: "Хэт олон буруу оролдлого. Дахин код авна уу." }; }
  if (rec.hash !== hashCode(String(code || "").trim(), k)) return { ok: false, reason: "Код буруу байна." };
  otps.delete(k);
  return { ok: true };
}

/**
 * Rate-limit шалгах. { ok, retryAfter(сек) } буцаана.
 *   max         — цонхон дахь дээд тоо
 *   windowMs    — цонхны урт
 *   minInterval — дараалсан хоёр хүсэлтийн хамгийн бага зай (сонголт)
 */
function rateLimit(key, max, windowMs, minIntervalMs) {
  var now = Date.now();
  var rec = rl.get(key);
  if (!rec || now > rec.resetAt) { rec = { count: 0, resetAt: now + windowMs, last: 0 }; rl.set(key, rec); }
  if (minIntervalMs && rec.last && now - rec.last < minIntervalMs) {
    return { ok: false, retryAfter: Math.ceil((minIntervalMs - (now - rec.last)) / 1000) };
  }
  if (rec.count >= max) {
    return { ok: false, retryAfter: Math.ceil((rec.resetAt - now) / 1000) };
  }
  rec.count++; rec.last = now;
  return { ok: true };
}

/* Хугацаа дууссан бичлэгүүдийг тогтмол цэвэрлэх */
var timer = setInterval(function () {
  var now = Date.now();
  otps.forEach(function (v, k) { if (now > v.expiresAt) otps.delete(k); });
  rl.forEach(function (v, k) { if (now > v.resetAt) rl.delete(k); });
}, 5 * 60 * 1000);
if (timer.unref) timer.unref();

module.exports = { generateOtp: generateOtp, verifyOtp: verifyOtp, rateLimit: rateLimit };
