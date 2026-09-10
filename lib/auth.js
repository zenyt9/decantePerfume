/**
 * lib/auth.js — Нэвтрэлт, нууц үг, session
 * =====================================================================
 * • Нууц үгийг scrypt-ээр давс (salt)-тай хааш хийж хадгална
 * • Session token-ийг санамсаргүй үүсгэж, cookie-гоор дамжуулна
 * • Хүсэлт бүрээс идэвхтэй хэрэглэгчийг тодорхойлно
 */
"use strict";
const crypto = require("crypto");
const db = require("./db");
const { parseCookies } = require("./util");

const SESSION_COOKIE = "dc_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 хоног

/* -------------------- Нууц үг -------------------- */

/** Нууц үгийг "salt:hash" хэлбэрээр хааш хийх */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

/** Нууц үг таарч буйг тогтмол хугацаанд шалгах */
function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(":") === -1) return false;
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* -------------------- Session -------------------- */

/** Хэрэглэгчид шинэ session үүсгэх */
function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  db.insert("sessions", {
    token: token,
    userId: userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  cleanupExpired();
  return token;
}

/** Session-ийг устгах (гарах) */
function destroySession(token) {
  const arr = db.table("sessions");
  const idx = arr.findIndex((x) => x.token === token);
  if (idx > -1) { arr.splice(idx, 1); db.save(); }
}

/** Хугацаа дууссан session-уудыг цэвэрлэх */
function cleanupExpired() {
  const arr = db.table("sessions");
  const now = Date.now();
  let changed = false;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].expiresAt < now) { arr.splice(i, 1); changed = true; }
  }
  if (changed) db.save();
}

/** Хүсэлтээс идэвхтэй хэрэглэгчийг олох (нууц үггүйгээр) */
function currentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = db.findBy("sessions", (x) => x.token === token);
  if (!session || session.expiresAt < Date.now()) return null;
  const user = db.find("users", session.userId);
  if (!user) return null;
  return { user: user, token: token };
}

/** Хэрэглэгчийн мэдээллийг гадагш өгөхдөө нууц үгийг хасах */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    address: user.address || "",
    role: user.role,
    createdAt: user.createdAt,
  };
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  currentUser,
  publicUser,
};
