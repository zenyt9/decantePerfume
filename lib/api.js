/**
 * lib/api.js — REST API маршрутууд
 * =====================================================================
 * Бүх /api/... хүсэлтийг эндээс боловсруулна. Аюулгүй байдлын гол дүрэм:
 *   • Захиалгын үнийг СЕРВЕР дээр дахин тооцно (клиентэд итгэхгүй)
 *   • Админ эрх шаардсан үйлдлийг role шалгаж хамгаална
 */
"use strict";
const db = require("./db");
const auth = require("./auth");
const U = require("./util");
const otp = require("./otp");
const mail = require("./mail");

/* Дэлгүүрийн тохиргоо (хүргэлт, хэмжээ) */
const SETTINGS = {
  sizes: [5, 10, 20, 50, 100],
  delivery: { fee: 5000, freeOver: 120000 },
};

/* Шинэ захиалга ирэхэд мэдэгдэл очих дэлгүүрийн и-мэйл */
const OWNER_EMAIL = process.env.OWNER_EMAIL || "decanteperfume71@gmail.com";

/* Захиалгын төлвүүд */
const ORDER_STATUSES = ["new", "confirmed", "delivering", "done", "cancelled"];

/* ------------------------------------------------------------------ */
/*  Эрх шалгах туслахууд                                               */
/* ------------------------------------------------------------------ */
function requireAuth(req, res) {
  const ctx = auth.currentUser(req);
  if (!ctx) { U.sendError(res, 401, "Нэвтрэх шаардлагатай."); return null; }
  return ctx;
}
function requireAdmin(req, res) {
  const ctx = requireAuth(req, res);
  if (!ctx) return null;
  if (ctx.user.role !== "admin") { U.sendError(res, 403, "Админ эрх шаардлагатай."); return null; }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Гол маршрутлагч                                                    */
/* ------------------------------------------------------------------ */
async function handleApi(req, res, pathname, query) {
  const method = req.method;
  const seg = pathname.replace(/^\/api\//, "").replace(/\/+$/, "").split("/");
  // seg жишээ: ["products"] эсвэл ["products","prod_123"]

  try {
    // ---------- AUTH ----------
    if (seg[0] === "auth") {
      if (seg[1] === "register" && method === "POST") return register(req, res);
      if (seg[1] === "login" && method === "POST") return login(req, res);
      if (seg[1] === "logout" && method === "POST") return logout(req, res);
      if (seg[1] === "me" && method === "GET") return me(req, res);
      if (seg[1] === "me" && method === "PATCH") return updateMe(req, res);
      if (seg[1] === "send-code" && method === "POST") return sendCode(req, res);
      if (seg[1] === "verify-email" && method === "POST") return verifyEmail(req, res);
      if (seg[1] === "reset-password" && method === "POST") return resetPassword(req, res);
    }

    // ---------- PRODUCTS ----------
    if (seg[0] === "products") {
      if (!seg[1]) {
        if (method === "GET") return listProducts(req, res, query);
        if (method === "POST") return createProduct(req, res);
      } else {
        if (method === "PATCH") return updateProduct(req, res, seg[1]);
        if (method === "DELETE") return deleteProduct(req, res, seg[1]);
      }
    }

    // ---------- BRANDS ----------
    if (seg[0] === "brands") {
      if (!seg[1]) {
        if (method === "GET") return listBrands(req, res);
        if (method === "POST") return createBrand(req, res);
      } else {
        if (method === "PATCH") return updateBrand(req, res, seg[1]);
        if (method === "DELETE") return deleteBrand(req, res, seg[1]);
      }
    }

    // ---------- ORDERS ----------
    if (seg[0] === "orders") {
      if (!seg[1]) {
        if (method === "GET") return listOrders(req, res);
        if (method === "POST") return createOrder(req, res);
      } else {
        if (method === "PATCH") return updateOrder(req, res, seg[1]);
      }
    }

    // ---------- STATS ----------
    if (seg[0] === "stats" && method === "GET") return stats(req, res);

    // ---------- SETTINGS (нийтэд) ----------
    if (seg[0] === "settings" && method === "GET") {
      return U.sendJson(res, 200, SETTINGS);
    }

    return U.sendError(res, 404, "API маршрут олдсонгүй.");
  } catch (err) {
    console.error("API алдаа:", err);
    return U.sendError(res, 400, err.message || "Хүсэлт боловсруулахад алдаа гарлаа.");
  }
}

/* ================================================================== */
/*  AUTH                                                              */
/* ================================================================== */
async function register(req, res) {
  const body = await U.readJsonBody(req);
  const name = U.str(body.name, 80);
  const email = U.str(body.email, 120).toLowerCase();
  const phone = U.str(body.phone, 40);
  const password = String(body.password || "");

  // Bulk бүртгэл / и-мэйл спам хамгаалалт: нэг IP-ээс цагт 10 хүртэл бүртгэл.
  // (login/send-code адил — баталгаажсан домэйнийг Resend-ийн abuse-аас хамгаална.)
  const rlRes = otp.rateLimit("register:" + U.clientIp(req), 10, 60 * 60 * 1000);
  if (!rlRes.ok)
    return U.sendError(res, 429, "Хэт олон бүртгэл. " + rlRes.retryAfter + " секундын дараа дахин оролдоно уу.");

  if (!name) return U.sendError(res, 400, "Нэрээ оруулна уу.");
  if (!U.isEmail(email)) return U.sendError(res, 400, "И-мэйл буруу байна.");
  if (password.length < 6) return U.sendError(res, 400, "Нууц үг дор хаяж 6 тэмдэгт байх ёстой.");
  if (db.findBy("users", (u) => u.email === email))
    return U.sendError(res, 409, "Энэ и-мэйл бүртгэлтэй байна.");

  const user = db.insert("users", {
    id: U.genId("user"),
    name: name,
    email: email,
    phone: phone,
    address: "",
    passwordHash: auth.hashPassword(password),
    role: "customer",
    emailVerified: false,
    createdAt: Date.now(),
  });

  const token = auth.createSession(user.id);
  U.setCookie(res, auth.SESSION_COOKIE, token, { maxAge: auth.SESSION_TTL_MS / 1000 });

  // И-мэйл баталгаажуулах код илгээх (алдаа гарвал бүртгэл амжилттай хэвээр)
  try {
    const code = otp.generateOtp("verify", user.email);
    const m = mail.otpEmail(code, "verify");
    await mail.sendMail({ to: user.email, subject: m.subject, html: m.html });
  } catch (e) { console.error("Баталгаажуулах и-мэйл алдаа:", e.message); }

  return U.sendJson(res, 201, { user: auth.publicUser(user), needsVerification: true });
}

async function login(req, res) {
  const body = await U.readJsonBody(req);
  const email = U.str(body.email, 120).toLowerCase();
  const password = String(body.password || "");

  // Brute-force хамгаалалт
  const rlRes = otp.rateLimit("login:" + U.clientIp(req), 12, 15 * 60 * 1000);
  if (!rlRes.ok)
    return U.sendError(res, 429, "Хэт олон оролдлого. " + rlRes.retryAfter + " секундын дараа дахин оролдоно уу.");

  const user = db.findBy("users", (u) => u.email === email);
  if (!user || !auth.verifyPassword(password, user.passwordHash))
    return U.sendError(res, 401, "И-мэйл эсвэл нууц үг буруу байна.");

  const token = auth.createSession(user.id);
  U.setCookie(res, auth.SESSION_COOKIE, token, { maxAge: auth.SESSION_TTL_MS / 1000 });
  return U.sendJson(res, 200, { user: auth.publicUser(user) });
}

function logout(req, res) {
  const ctx = auth.currentUser(req);
  if (ctx) auth.destroySession(ctx.token);
  U.setCookie(res, auth.SESSION_COOKIE, "", { maxAge: 0 });
  return U.sendJson(res, 200, { ok: true });
}

function me(req, res) {
  const ctx = auth.currentUser(req);
  return U.sendJson(res, 200, { user: ctx ? auth.publicUser(ctx.user) : null });
}

async function updateMe(req, res) {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const body = await U.readJsonBody(req);
  const patch = {};
  if (body.name != null) patch.name = U.str(body.name, 80) || ctx.user.name;
  if (body.phone != null) patch.phone = U.str(body.phone, 40);
  if (body.address != null) patch.address = U.str(body.address, 200);

  // Нууц үг солих (сонголтоор)
  if (body.newPassword) {
    if (String(body.newPassword).length < 6)
      return U.sendError(res, 400, "Шинэ нууц үг дор хаяж 6 тэмдэгт байх ёстой.");
    if (!auth.verifyPassword(String(body.currentPassword || ""), ctx.user.passwordHash))
      return U.sendError(res, 401, "Одоогийн нууц үг буруу байна.");
    patch.passwordHash = auth.hashPassword(String(body.newPassword));
  }

  const updated = db.update("users", ctx.user.id, patch);

  // Нууц үг сольсон бол бусад бүх session-ийг цуцалж, энэ төхөөрөмжид
  // шинэ session олгоно (энд нэвтэрсэн хэвээр, бусад төхөөрөмж гарна).
  if (patch.passwordHash) {
    auth.destroyUserSessions(ctx.user.id);
    const token = auth.createSession(ctx.user.id);
    U.setCookie(res, auth.SESSION_COOKIE, token, { maxAge: auth.SESSION_TTL_MS / 1000 });
  }

  return U.sendJson(res, 200, { user: auth.publicUser(updated) });
}

/* ---- OTP: код илгээх, и-мэйл баталгаажуулах, нууц үг сэргээх ---- */

async function sendCode(req, res) {
  const body = await U.readJsonBody(req);
  const purpose = body.purpose === "reset" ? "reset" : "verify";
  let email;

  if (purpose === "verify") {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    email = ctx.user.email;
    if (ctx.user.emailVerified) return U.sendJson(res, 200, { ok: true, already: true });
  } else {
    email = U.str(body.email, 120).toLowerCase();
    if (!U.isEmail(email)) return U.sendError(res, 400, "И-мэйл буруу байна.");
  }

  // Rate-limit: нэг и-мэйлд 5/15мин, дор хаяж 45 сек зайтай
  const rlRes = otp.rateLimit("otp:" + purpose + ":" + email, 5, 15 * 60 * 1000, 45 * 1000);
  if (!rlRes.ok)
    return U.sendError(res, 429, "Түр хүлээнэ үү. " + rlRes.retryAfter + " секундын дараа дахин код авна уу.");

  // reset үед хэрэглэгч байхгүй бол ч амжилттай гэж хариулна (и-мэйл enumeration хамгаалалт)
  const user = db.findBy("users", (u) => u.email === email);
  if (purpose === "reset" && !user) return U.sendJson(res, 200, { ok: true });

  try {
    const code = otp.generateOtp(purpose, email);
    const m = mail.otpEmail(code, purpose);
    await mail.sendMail({ to: email, subject: m.subject, html: m.html });
  } catch (e) {
    console.error("Код илгээх алдаа:", e.message);
    return U.sendError(res, 502, "И-мэйл илгээхэд алдаа гарлаа. Дараа дахин оролдоно уу.");
  }
  return U.sendJson(res, 200, { ok: true });
}

async function verifyEmail(req, res) {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const body = await U.readJsonBody(req);
  const r = otp.verifyOtp("verify", ctx.user.email, U.str(body.code, 6));
  if (!r.ok) return U.sendError(res, 400, r.reason);
  const updated = db.update("users", ctx.user.id, { emailVerified: true });
  return U.sendJson(res, 200, { user: auth.publicUser(updated) });
}

async function resetPassword(req, res) {
  const body = await U.readJsonBody(req);
  const email = U.str(body.email, 120).toLowerCase();
  const code = U.str(body.code, 6);
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 6) return U.sendError(res, 400, "Шинэ нууц үг дор хаяж 6 тэмдэгт байх ёстой.");

  const r = otp.verifyOtp("reset", email, code);
  if (!r.ok) return U.sendError(res, 400, r.reason);

  const user = db.findBy("users", (u) => u.email === email);
  if (!user) return U.sendError(res, 404, "Хэрэглэгч олдсонгүй.");
  db.update("users", user.id, { passwordHash: auth.hashPassword(newPassword) });

  // Хуучин бүх session-ийг цуцлах (халдагч session-тэй байсан бол хүчингүй болно)
  auth.destroyUserSessions(user.id);

  // Шинэ нууц үгээр шууд нэвтрүүлнэ
  const token = auth.createSession(user.id);
  U.setCookie(res, auth.SESSION_COOKIE, token, { maxAge: auth.SESSION_TTL_MS / 1000 });
  return U.sendJson(res, 200, { user: auth.publicUser(user) });
}

/* ================================================================== */
/*  PRODUCTS                                                          */
/* ================================================================== */
function listProducts(req, res, query) {
  const ctx = auth.currentUser(req);
  const isAdmin = ctx && ctx.user.role === "admin";
  let list = db.table("products");
  // Хэрэглэгчид зөвхөн идэвхтэй бараа; админ бүгдийг (?all=1)
  if (!(isAdmin && query.all === "1")) {
    list = list.filter((p) => p.active !== false);
  }
  return U.sendJson(res, 200, { products: list });
}

function validateProductPayload(body, partial) {
  const out = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has("name")) {
    out.name = U.str(body.name, 80);
    if (!out.name) throw new Error("Барааны нэр шаардлагатай.");
  }
  if (!partial || has("brand")) {
    out.brand = U.str(body.brand, 80);
    if (!out.brand) throw new Error("Брэнд шаардлагатай.");
  }
  if (!partial || has("gender")) {
    out.gender = ["men", "women", "unisex"].indexOf(body.gender) > -1 ? body.gender : "unisex";
  }
  if (!partial || has("prices")) {
    const pr = body.prices || {};
    out.prices = {};
    SETTINGS.sizes.forEach((s) => {
      const v = Number(pr[s]);
      out.prices[s] = isFinite(v) && v >= 0 ? Math.round(v) : 0;
    });
  }
  if (!partial || has("notes")) {
    const n = body.notes || {};
    const arr = (x) => Array.isArray(x) ? x.map((s) => U.str(s, 40)).filter(Boolean).slice(0, 8) : [];
    out.notes = { top: arr(n.top), heart: arr(n.heart), base: arr(n.base) };
  }
  if (!partial || has("accent")) {
    out.accent = /^#[0-9a-fA-F]{6}$/.test(body.accent) ? body.accent : "#8a6d3f";
  }
  if (has("year")) out.year = Number(body.year) || null;
  if (has("popular")) out.popular = !!body.popular;
  if (has("active")) out.active = !!body.active;
  if (has("description")) out.description = U.str(body.description, 400);
  return out;
}

/** Брэнд нэрийг brands цуглуулгад байхгүй бол шинээр үүсгэж, id-г буцаана */
function ensureBrand(name) {
  if (!name) return null;
  let b = db.findBy("brands", (x) => x.name.toLowerCase() === name.toLowerCase());
  if (!b) b = db.insert("brands", { id: U.genId("brand"), name: name, createdAt: Date.now() });
  return b.id;
}

async function createProduct(req, res) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const body = await U.readJsonBody(req);
  const data = validateProductPayload(body, false);
  data.id = U.genId("prod");
  data.brandId = ensureBrand(data.brand);
  data.popular = data.popular || false;
  data.active = data.active !== false;
  data.description = data.description || "";
  data.year = data.year || null;
  data.createdAt = Date.now();
  db.insert("products", data);
  return U.sendJson(res, 201, { product: data });
}

async function updateProduct(req, res, id) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  if (!db.find("products", id)) return U.sendError(res, 404, "Бараа олдсонгүй.");
  const body = await U.readJsonBody(req);
  const patch = validateProductPayload(body, true);
  if (patch.brand) patch.brandId = ensureBrand(patch.brand);
  const updated = db.update("products", id, patch);
  return U.sendJson(res, 200, { product: updated });
}

function deleteProduct(req, res, id) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const ok = db.remove("products", id);
  if (!ok) return U.sendError(res, 404, "Бараа олдсонгүй.");
  return U.sendJson(res, 200, { ok: true });
}

/* ================================================================== */
/*  BRANDS                                                            */
/* ================================================================== */
function listBrands(req, res) {
  return U.sendJson(res, 200, { brands: db.table("brands") });
}

async function createBrand(req, res) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const body = await U.readJsonBody(req);
  const name = U.str(body.name, 80);
  if (!name) return U.sendError(res, 400, "Брэндийн нэр шаардлагатай.");
  if (db.findBy("brands", (b) => b.name.toLowerCase() === name.toLowerCase()))
    return U.sendError(res, 409, "Ийм нэртэй брэнд бүртгэлтэй байна.");
  const brand = db.insert("brands", { id: U.genId("brand"), name: name, createdAt: Date.now() });
  return U.sendJson(res, 201, { brand: brand });
}

async function updateBrand(req, res, id) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const brand = db.find("brands", id);
  if (!brand) return U.sendError(res, 404, "Брэнд олдсонгүй.");
  const body = await U.readJsonBody(req);
  const name = U.str(body.name, 80);
  if (!name) return U.sendError(res, 400, "Брэндийн нэр шаардлагатай.");
  const oldName = brand.name;
  db.update("brands", id, { name: name });
  // Холбоотой бүтээгдэхүүний брэнд нэрийг мөн шинэчлэх
  db.filter("products", (p) => p.brandId === id || p.brand === oldName)
    .forEach((p) => db.update("products", p.id, { brand: name, brandId: id }));
  return U.sendJson(res, 200, { brand: db.find("brands", id) });
}

function deleteBrand(req, res, id) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const brand = db.find("brands", id);
  if (!brand) return U.sendError(res, 404, "Брэнд олдсонгүй.");
  const used = db.filter("products", (p) => p.brandId === id || p.brand === brand.name).length;
  if (used > 0)
    return U.sendError(res, 409, used + " бараа энэ брэндтэй холбоотой байна. Эхлээд тэдгээрийг өөрчилнө үү.");
  db.remove("brands", id);
  return U.sendJson(res, 200, { ok: true });
}

/* ================================================================== */
/*  ORDERS                                                            */
/* ================================================================== */
function computeDelivery(subtotal) {
  if (subtotal <= 0) return 0;
  return subtotal >= SETTINGS.delivery.freeOver ? 0 : SETTINGS.delivery.fee;
}

async function createOrder(req, res) {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const body = await U.readJsonBody(req);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) return U.sendError(res, 400, "Сагс хоосон байна.");

  // Үнийг сервер дээр дахин тооцно
  const items = [];
  let subtotal = 0;
  for (const it of rawItems) {
    const product = db.find("products", U.str(it.productId));
    const ml = Number(it.ml);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    if (!product || product.active === false) continue;
    if (SETTINGS.sizes.indexOf(ml) === -1) continue;
    const unitPrice = Number(product.prices[ml]) || 0;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    items.push({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      ml: ml,
      qty: qty,
      unitPrice: unitPrice,
      lineTotal: lineTotal,
    });
  }
  if (!items.length) return U.sendError(res, 400, "Захиалах боломжтой бараа алга.");

  const deliveryFee = computeDelivery(subtotal);
  const customer = {
    name: U.str(body.name, 80) || ctx.user.name,
    phone: U.str(body.phone, 40) || ctx.user.phone,
    address: U.str(body.address, 200) || ctx.user.address,
    note: U.str(body.note, 300),
  };
  if (!customer.phone) return U.sendError(res, 400, "Утасны дугаар шаардлагатай.");

  const order = db.insert("orders", {
    id: U.genId("order"),
    code: U.genOrderCode(),
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    customer: customer,
    items: items,
    subtotal: subtotal,
    deliveryFee: deliveryFee,
    total: subtotal + deliveryFee,
    status: "new",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Дэлгүүрт (эзэнд) шинэ захиалгын мэдэгдэл илгээх (алдаа гарвал захиалга хэвээр)
  try {
    const m = mail.orderEmail(order);
    await mail.sendMail({ to: OWNER_EMAIL, subject: m.subject, html: m.html });
  } catch (e) { console.error("Захиалгын мэдэгдэл алдаа:", e.message); }

  return U.sendJson(res, 201, { order: order });
}

function listOrders(req, res) {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  let list;
  if (ctx.user.role === "admin") {
    list = db.table("orders").slice();
  } else {
    list = db.filter("orders", (o) => o.userId === ctx.user.id);
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  return U.sendJson(res, 200, { orders: list });
}

async function updateOrder(req, res, id) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const order = db.find("orders", id);
  if (!order) return U.sendError(res, 404, "Захиалга олдсонгүй.");
  const body = await U.readJsonBody(req);
  const patch = { updatedAt: Date.now() };

  if (body.status != null) {
    if (ORDER_STATUSES.indexOf(body.status) === -1)
      return U.sendError(res, 400, "Төлөв буруу байна.");
    patch.status = body.status;
  }
  // Захиалагчийн мэдээллийг засах
  if (body.customer && typeof body.customer === "object") {
    patch.customer = {
      name: U.str(body.customer.name, 80) || order.customer.name,
      phone: U.str(body.customer.phone, 40) || order.customer.phone,
      address: U.str(body.customer.address, 200),
      note: U.str(body.customer.note, 300),
    };
  }
  const updated = db.update("orders", id, patch);
  return U.sendJson(res, 200, { order: updated });
}

/* ================================================================== */
/*  STATS (админ хянах самбар)                                        */
/* ================================================================== */
function stats(req, res) {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const orders = db.table("orders");
  const byStatus = {};
  ORDER_STATUSES.forEach((s) => (byStatus[s] = 0));
  let revenue = 0;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  let todayCount = 0;
  orders.forEach((o) => {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.status !== "cancelled") revenue += o.total;
    if (o.createdAt >= startOfToday.getTime()) todayCount++;
  });
  return U.sendJson(res, 200, {
    totalOrders: orders.length,
    todayOrders: todayCount,
    byStatus: byStatus,
    revenue: revenue,
    totalProducts: db.table("products").length,
    activeProducts: db.filter("products", (p) => p.active !== false).length,
    totalBrands: db.table("brands").length,
    totalCustomers: db.filter("users", (u) => u.role === "customer").length,
  });
}

module.exports = { handleApi, SETTINGS, ORDER_STATUSES };
