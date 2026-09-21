/**
 * lib/otp.js — Нэг удаагийн код (OTP) ба rate-limit
 * =====================================================================
 * OTP кодыг ӨГӨГДЛИЙН САНД хадгална — ингэснээр сервер дахин ачаалагдах,
 * унтаж сэрэх үед ч код хүчинтэй хэвээр (хэрэглэгч бүртгүүлээд хэсэг
 * хугацааны дараа баталгаажуулж чадна). Кодыг ил хадгалахгүй — hash-ийг л.
 *
 * Rate-limit нь санах ойд (богино насттай, restart дээр reset болох нь
 * хүлээн зөвшөөрөгдөнө — гол хамгаалалт хэвийн ажиллагаанд хадгалагдана).
 */
"use strict";
const crypto = require("crypto");
const db = require("./db");
const { genId } = require("./util");

var rl = new Map(); // rate-limit: key -> { count, resetAt, last }

var OTP_TTL = 10 * 60 * 1000; // 10 минут
var OTP_MAX_ATTEMPTS = 5;

function keyFor(purpose, email) {
  return purpose + ":" + String(email || "").toLowerCase();
}
function hashCode(code, k) {
  return crypto.createHash("sha256").update(code + "|" + k).digest("hex");
}
function findOtp(k) {
  return db.findBy("otps", function (o) { return o.key === k; });
}
function cleanupOtps() {
  var now = Date.now();
  db.filter("otps", function (o) { return (o.expiresAt || 0) < now; })
    .forEach(function (o) { db.remove("otps", o.id); });
}

/** 6 оронтой код үүсгэж санд хадгална, кодыг буцаана */
function generateOtp(purpose, email) {
  var k = keyFor(purpose, email);
  var code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  var existing = findOtp(k);
  if (existing) db.remove("otps", existing.id);
  db.insert("otps", {
    id: genId("otp"),
    key: k,
    hash: hashCode(code, k),
    expiresAt: Date.now() + OTP_TTL,
    attempts: 0,
    createdAt: Date.now(),
  });
  cleanupOtps();
  return code;
}

/** Кодыг шалгана. { ok, reason } буцаана. Амжилттай бол кодыг устгана. */
function verifyOtp(purpose, email, code) {
  var k = keyFor(purpose, email);
  var rec = findOtp(k);
  if (!rec) return { ok: false, reason: "Код олдсонгүй. Дахин код авна уу." };
  if (Date.now() > rec.expiresAt) {
    db.remove("otps", rec.id);
    return { ok: false, reason: "Кодын хугацаа дууссан. Дахин авна уу." };
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    db.remove("otps", rec.id);
    return { ok: false, reason: "Хэт олон буруу оролдлого. Дахин код авна уу." };
  }
  if (rec.hash !== hashCode(String(code || "").trim(), k)) {
    db.update("otps", rec.id, { attempts: rec.attempts + 1 });
    return { ok: false, reason: "Код буруу байна." };
  }
  db.remove("otps", rec.id); // амжилттай — кодыг устгана
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

/* Rate-limit санах ойн цэвэрлэгч (OTP-г generate/verify бүрд цэвэрлэдэг) */
var timer = setInterval(function () {
  var now = Date.now();
  rl.forEach(function (v, k) { if (now > v.resetAt) rl.delete(k); });
}, 5 * 60 * 1000);
if (timer.unref) timer.unref();

module.exports = { generateOtp: generateOtp, verifyOtp: verifyOtp, rateLimit: rateLimit };
