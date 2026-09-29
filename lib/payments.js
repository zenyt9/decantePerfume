/**
 * lib/payments.js — Захиалгын онлайн төлбөр (QPay, Wire-ээр дамжуулж)
 * =====================================================================
 * Урсгал:
 *   1. Захиалга "qpay" хэлбэрээр үүснэ → payment.status = "pending"
 *      (бараа нөөцөөс түр хасагдана, и-мэйл хараахан илгээхгүй).
 *   2. startPayment → Wire дээр PaymentIntent + hosted checkout үүсгэж,
 *      худалдан авагчийг pay.wire.mn (QR + банкны апп) руу чиглүүлнэ.
 *   3. Төлбөр амжилттай болсныг ГУРВАН замаар илрүүлнэ (аль нь ч түрүүлж болно):
 *        • Wire-ийн гарын үсэгтэй webhook (payment_intent.succeeded)
 *        • Худалдан авагч сайт руу буцаж ирэхэд хийх шалгалт
 *        • Тогтмол reconcile (хүлээгдэж буй захиалгыг Wire-аас шалгана)
 *      markPaid нь idempotent — хэд дуудагдсан ч нэг л удаа биелнэ.
 *   4. PAY_WINDOW дотор төлөгдөөгүй бөгөөд идэвхтэй нэхэмжлэхгүй болсон захиалга
 *      цуцлагдаж, бараа нөөцөд буцна. Худалдан авагч төлж байх үед нэхэмжлэхийг
 *      хэзээ ч таслахгүй — Wire-ийн TTL дуусахыг хүлээнэ.
 *
 * Аюулгүй байдал:
 *   • Төлбөрийг зөвхөн Wire API-аас дахин татсан PaymentIntent-ээр баталгаажуулна
 *     (webhook-ийн body-д шууд итгэхгүй); дүн, захиалгын id, test/live горимыг шалгана.
 *   • sk_test түлхүүртэй үед онлайн төлбөр ЗӨВХӨН админд (туршилт) — жинхэнэ
 *     үйлчлүүлэгчид sandbox-оор "төлсөн" болох боломжгүй. Тест төлбөр "ТЕСТ"
 *     гэж тэмдэглэгдэж, орлогод тооцогдохгүй.
 *   • Нэг захиалгын төлбөрийн үйлдлүүд (эхлүүлэх, цуцлах, хугацаа дуусгах)
 *     дараалалд (lock) орж ажиллана — зэрэгцэж давхар нэхэмжлэх үүсэхгүй.
 */
"use strict";
const db = require("./db");
const mail = require("./mail");
const wire = require("./wire");
const U = require("./util");

const OWNER_EMAIL = process.env.OWNER_EMAIL || "decanteperfume71@gmail.com";
// Шинэ нэхэмжлэх үүсгэх боломжтой хугацаа (захиалснаас хойш, default 60 минут)
const PAY_WINDOW_MS = (Number(process.env.PAY_WINDOW_MIN) > 0 ? Number(process.env.PAY_WINDOW_MIN) : 60) * 60 * 1000;
const RECONCILE_MS = (Number(process.env.RECONCILE_SEC) > 0 ? Number(process.env.RECONCILE_SEC) : 60) * 1000;
const CHECK_MIN_GAP_MS = 4000;          // нэг захиалгыг Wire-аас дахин шалгах хамгийн бага зай
const REUSE_MIN_LEFT_MS = 90 * 1000;    // checkout-д дор хаяж ийм хугацаа үлдсэн бол дахин ашиглана
const INTENT_GRACE_MS = 2 * 60 * 1000;  // нэхэмжлэхийн хугацаа дууссанаас хойш хүлээх нэмэлт хугацаа
const UNKNOWN_TTL_MS = 15 * 60 * 1000;  // expires_at мэдэгдэхгүй бол цонхноос хойш хүлээх хугацаа
const ACTIVE = ["new", "requires_payment_method", "requires_action", "requires_capture", "processing"];

const lastCheck = new Map();            // orderId -> сүүлд Wire-аас шалгасан цаг (санах ойд)

/** Хэрэглэгчид харуулах алдаа (400) */
function userError(message) {
  const e = new Error(message);
  e.userFacing = true;
  return e;
}

/* ------------------------------------------------------------------ */
/*  Нэг захиалгын үйлдлүүдийг дараалалд оруулах (single-process lock)  */
/* ------------------------------------------------------------------ */
const locks = new Map();
function withLock(orderId, fn) {
  const prev = locks.get(orderId) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(function () {}, function () {});
  locks.set(orderId, tail);
  tail.then(function () { if (locks.get(orderId) === tail) locks.delete(orderId); });
  return run;
}

/* ------------------------------------------------------------------ */
/*  Горим: хэн онлайн төлбөр ашиглах вэ                                */
/* ------------------------------------------------------------------ */
/** Энэ хэрэглэгчийн захиалга онлайнаар төлөгдөх эсэх.
    LIVE түлхүүртэй бол бүх хэрэглэгч; TEST түлхүүртэй бол зөвхөн админ (туршилт).
    WIRE_ADMIN_ONLY=1 — live түлхүүртэй ч зөвхөн админд (эхний бодит туршилтад),
    туршиж дуусаад энэ хувьсагчийг устгахад бүх хэрэглэгчид нээгдэнэ. */
function onlineAllowed(user) {
  if (!wire.enabled()) return false;
  const isAdmin = !!(user && user.role === "admin");
  if (process.env.WIRE_ADMIN_ONLY === "1") return isAdmin;
  return wire.isLive() || isAdmin;
}

/** Захиалга одоогийн түлхүүрээс өөр горимд (test/live) үүссэн эсэх */
function modeMismatch(order) {
  const p = order.payment || {};
  return p.livemode !== undefined && !!p.livemode !== wire.isLive();
}

/* ------------------------------------------------------------------ */
/*  Нөөц (stock)                                                       */
/* ------------------------------------------------------------------ */
function isTracked(p) {
  return !!p && p.stock !== "" && p.stock !== null && p.stock !== undefined;
}
/** Захиалгын бараануудыг нөөцөөс хасах (тоо тавьсан бараанаас л) */
function reserveStock(items) {
  items.forEach(function (it) {
    const p = db.find("products", it.productId);
    if (isTracked(p)) db.update("products", p.id, { stock: Math.max(0, Math.round(Number(p.stock) || 0) - it.qty) });
  });
}
/** Цуцлагдсан захиалгын бараануудыг нөөцөд буцаах */
function releaseStock(items) {
  items.forEach(function (it) {
    const p = db.find("products", it.productId);
    if (isTracked(p)) db.update("products", p.id, { stock: Math.round(Number(p.stock) || 0) + it.qty });
  });
}

/* ------------------------------------------------------------------ */
/*  Мэдэгдэл                                                           */
/* ------------------------------------------------------------------ */
async function sendSafe(to, m, what) {
  if (!m || !to) return;
  try { await mail.sendMail({ to: to, subject: m.subject, html: m.html }); }
  catch (e) { console.error(what + " и-мэйл алдаа:", e.message); }
}
/** Эзэнд шинэ захиалгын, захиалагчид баталгаажуулах и-мэйл (алдаа гарвал захиалга хэвээр) */
async function notifyOrderPlaced(order) {
  await sendSafe(OWNER_EMAIL, mail.orderEmail(order), "Захиалгын мэдэгдэл");
  await sendSafe(order.userEmail, mail.customerOrderEmail(order), "Захиалагчийн");
}

/* ------------------------------------------------------------------ */
/*  Төлбөрийн төлөв                                                    */
/* ------------------------------------------------------------------ */
function isOnline(order) {
  return !!(order && order.payment && order.payment.method === "qpay");
}

/** Захиалгын payment хэсгийг шинэчлэх (бусад талбарыг хадгална) */
function patchPayment(orderId, fields, extra) {
  const order = db.find("orders", orderId);
  if (!order) return null;
  const patch = Object.assign({ payment: Object.assign({}, order.payment, fields), updatedAt: Date.now() }, extra || {});
  return db.update("orders", orderId, patch);
}

/**
 * Төлбөр амжилттай гэж тэмдэглэх. Зөвхөн Wire API-аас татсан PaymentIntent-ээр
 * дуудагдана. Idempotent: аль хэдийн төлсөн бол юу ч хийхгүй.
 * @returns {boolean} төлсөн төлөвт байгаа эсэх
 */
function markPaid(orderId, pi) {
  const order = db.find("orders", orderId);
  if (!isOnline(order)) return false;
  const pay = order.payment;
  if (pay.status === "paid") {
    if (pay.intentId && pi.id !== pay.intentId) console.warn("[Wire] Давхар төлбөр байж болзошгүй:", order.code, pi.id);
    return true;
  }
  // Хамгаалалт: яг энэ захиалгын, яг энэ дүнтэй, зөв горимын төлбөр мөн эсэх
  const expected = Math.round(order.total) * wire.AMOUNT_FACTOR;
  const okOrder = !!(pi.metadata && pi.metadata.order_id === order.id);
  const okAmount = Number(pi.amount) === expected && String(pi.currency || "").toUpperCase() === "MNT";
  const okMode = !!pi.livemode === wire.isLive();
  if (pi.status !== "succeeded" || !okOrder || !okAmount || !okMode) {
    console.error("[Wire] Төлбөр таарсангүй — тэмдэглээгүй:", order.code,
      { status: pi.status, okOrder: okOrder, okAmount: okAmount, okMode: okMode, amount: pi.amount, expected: expected });
    return false;
  }
  const paidFields = { status: "paid", paidAt: Date.now(), intentId: pi.id, operator: pi.selected_operator || null, livemode: !!pi.livemode };

  // Админ цуцалсны дараа төлбөр орж ирвэл: захиалгыг сэргээхгүй, буцаан олголт шаардлагатай гэж тэмдэглэнэ
  if (order.status === "cancelled" && pay.status !== "expired") {
    const u = patchPayment(order.id, Object.assign(paidFields, { refundNeeded: true }));
    console.error("[Wire] Цуцлагдсан захиалгад төлбөр орж ирлээ — буцаан олгох шаардлагатай:", order.code);
    sendSafe(OWNER_EMAIL, mail.paidAfterCancelEmail(u), "Буцаан олголтын анхааруулга");
    return true;
  }
  // Хугацаа дуусч автоматаар цуцлагдсаны дараа төлбөр орж ирвэл захиалгыг сэргээнэ
  const revive = order.status === "cancelled" && pay.status === "expired";
  if (revive) reserveStock(order.items);
  const updated = patchPayment(order.id, paidFields, revive ? { status: "new" } : null);
  console.log("[Wire] Төлбөр амжилттай:", order.code, order.total + "₮", pi.livemode ? "" : "(ТЕСТ)");
  notifyOrderPlaced(updated);
  return true;
}

/** Wire-аас PaymentIntent татаж захиалгад тусгах. 404 (өөр горим/project) → төлөх боломжгүй гэж үзнэ. */
async function syncIntent(orderId, intentId) {
  lastCheck.set(orderId, Date.now());
  let pi;
  try {
    pi = await wire.retrievePaymentIntent(intentId);
  } catch (e) {
    if (e && e.status === 404) pi = { id: intentId, status: "canceled", missing: true };
    else throw e;
  }
  const order = db.find("orders", orderId);
  if (order && order.payment && order.payment.intentId === intentId && order.payment.intentStatus !== pi.status) {
    patchPayment(orderId, { intentStatus: pi.status, intentExpiresAt: pi.expires_at || null });
  }
  if (pi.status === "succeeded") markPaid(orderId, pi);
  return pi;
}

/* ------------------------------------------------------------------ */
/*  Төлбөр эхлүүлэх (hosted checkout)                                  */
/* ------------------------------------------------------------------ */
function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return proto + "://" + req.headers.host;
}

async function openSession(order, intentId, attempt, req) {
  const back = siteUrl(req) + "/?order=" + encodeURIComponent(order.id);
  const cs = await wire.createCheckoutSession({
    paymentIntent: intentId,
    successUrl: back,
    cancelUrl: back,
    idempotencyKey: "cs-" + order.id + "-" + attempt,
  });
  patchPayment(order.id, { checkoutUrl: cs.url, sessionId: cs.id || null });
  return cs.url;
}

function expiredError() {
  return userError("Энэ захиалгын төлбөр төлөх хугацаа дууссан байна. Бараагаа сагсандаа дахин нэмээд шинээр захиална уу.");
}

/**
 * Захиалгын төлбөрийн хуудасны холбоос авах. Идэвхтэй checkout байвал түүнийгээ
 * буцаана; хугацаа дууссан/цуцлагдсан бол (цонх дотор) шинэ PaymentIntent үүсгэнэ.
 * @returns {Promise<{url?: string, paid?: boolean}>}
 */
function startPayment(orderId, req) {
  return withLock(orderId, function () { return startPaymentLocked(orderId, req); });
}

async function startPaymentLocked(orderId, req) {
  let order = db.find("orders", orderId);
  if (!isOnline(order)) throw userError("Энэ захиалгыг онлайнаар төлөх боломжгүй.");
  if (!wire.enabled()) throw userError("QPay төлбөр түр ажиллахгүй байна.");
  let pay = order.payment;
  if (pay.status === "paid") return { paid: true };
  if (pay.status !== "pending" || order.status === "cancelled") throw expiredError();
  if (modeMismatch(order)) throw expiredError();

  // 1. Одоогийн intent-ээ шалгах
  if (pay.intentId) {
    const pi = await syncIntent(order.id, pay.intentId);
    order = db.find("orders", orderId); pay = order.payment;
    if (pay.status === "paid") return { paid: true };
    if (pay.status !== "pending" || order.status === "cancelled") throw expiredError();
    const msLeft = pi.expires_at ? pi.expires_at * 1000 - Date.now() : Infinity;
    // Дүн нь захиалгатай таарахгүй нэхэмжлэхийг хэзээ ч дахин ашиглахгүй — хааж шинийг үүсгэнэ
    const wrongAmount = !pi.missing && Number(pi.amount) !== Math.round(order.total) * wire.AMOUNT_FACTOR;
    if (wrongAmount && pi.status !== "canceled") {
      console.warn("[Wire] Буруу дүнтэй нэхэмжлэхийг хааж байна:", order.code, pi.id, pi.amount);
      try { await wire.cancelPaymentIntent(pi.id); } catch (e) {
        const again = await syncIntent(order.id, pi.id);
        if (again.status !== "canceled") throw userError("Өмнөх нэхэмжлэх хараахан хаагдаагүй байна. Хэдэн минутын дараа дахин оролдоно уу.");
      }
    } else if (pi.status === "processing" || pi.status === "requires_action" || pi.status === "requires_capture") {
      // Худалдан авагч нэхэмжлэхээ нээсэн/төлж байна — шинэ нэхэмжлэх үүсгэвэл давхар төлөгдөх эрсдэлтэй
      if (pay.checkoutUrl) return { url: pay.checkoutUrl };
      throw userError("Таны төлбөр хийгдэж байна. Хэдэн секундын дараа дахин шалгана уу.");
    }
    if (!wrongAmount && (pi.status === "requires_payment_method" || pi.status === "new") && msLeft > REUSE_MIN_LEFT_MS) {
      if (pay.checkoutUrl) return { url: pay.checkoutUrl };
      return { url: await openSession(order, pi.id, pay.attempts || 1, req) };
    }
    // Удахгүй дуусах гэж буй intent-ийг цуцлаад шинээр үүсгэнэ (давхар төлбөрөөс сэргийлнэ)
    if (!wrongAmount && pi.status !== "canceled") {
      try { await wire.cancelPaymentIntent(pi.id); } catch (e) {
        const again = await syncIntent(order.id, pi.id);
        if (again.status === "succeeded") return { paid: true };
        if (again.status !== "canceled") throw userError("Өмнөх нэхэмжлэх хараахан хаагдаагүй байна. Түр хүлээгээд дахин оролдоно уу.");
      }
    }
  }

  // 2. Шинэ нэхэмжлэх зөвхөн төлбөрийн цонх дотор
  if (Date.now() - order.createdAt > PAY_WINDOW_MS) throw expiredError();
  const attempt = (pay.attempts || 0) + 1;
  const pi = await wire.createPaymentIntent({
    amountTugrik: order.total,
    description: "Décante захиалга " + order.code,
    metadata: { order_id: order.id, order_code: order.code },
    idempotencyKey: "pi-" + order.id + "-" + attempt,
  });
  order = db.find("orders", orderId);
  patchPayment(order.id, {
    attempts: attempt,
    intentId: pi.id,
    intents: (order.payment.intents || []).concat(pi.id),
    intentStatus: pi.status,
    intentExpiresAt: pi.expires_at || null,
    checkoutUrl: null,
    sessionId: null,
    livemode: !!pi.livemode,
  });
  // Хүлээх хооронд (өөр intent-ээр) төлөгдсөн эсвэл админ цуцалсан бол шинэ нэхэмжлэхийг хаана
  order = db.find("orders", orderId);
  if (order.payment.status !== "pending" || order.status === "cancelled") {
    try { await wire.cancelPaymentIntent(pi.id); } catch (e) {}
    if (order.payment.status === "paid") return { paid: true };
    throw expiredError();
  }
  return { url: await openSession(order, pi.id, attempt, req) };
}

/**
 * Худалдан авагчид зориулсан төлөв (сайт руу буцаж ирэхэд poll хийнэ).
 * Хүлээгдэж буй бол Wire-аас шалгана (хэт олон дуудахгүйн тулд throttle);
 * throttle-д орсон үед сүүлд мэдэгдсэн Wire-ийн төлвийг буцаана.
 */
async function paymentStatus(orderId) {
  let order = db.find("orders", orderId);
  if (isOnline(order) && order.payment.status === "pending" && order.payment.intentId &&
      wire.enabled() && !modeMismatch(order)) {
    const since = Date.now() - (lastCheck.get(orderId) || 0);
    if (since >= CHECK_MIN_GAP_MS) {
      try { await syncIntent(orderId, order.payment.intentId); }
      catch (e) { console.error("[Wire] төлөв шалгах алдаа:", e.code || e.message); }
      order = db.find("orders", orderId);
    }
  }
  const pay = order.payment || { method: "manual" };
  const active = ACTIVE.indexOf(pay.intentStatus) > -1 &&
    (!pay.intentExpiresAt || pay.intentExpiresAt * 1000 > Date.now());
  return {
    orderId: order.id,
    code: order.code,
    total: order.total,
    orderStatus: order.status,
    method: pay.method,
    status: pay.status || null,
    intentStatus: pay.intentStatus || null,
    test: pay.livemode === false,
    canRetry: pay.method === "qpay" && pay.status === "pending" && order.status !== "cancelled" &&
      !modeMismatch(order) && (active || Date.now() - order.createdAt < PAY_WINDOW_MS),
  };
}

/* ------------------------------------------------------------------ */
/*  Админы үйлдлүүд                                                    */
/* ------------------------------------------------------------------ */
/** Идэвхтэй нэхэмжлэхийг Wire дээр хаах (амжилтгүй бол төлөгдсөн эсэхийг шалгана) */
async function closeIntent(order) {
  const pay = order.payment || {};
  if (!pay.intentId || modeMismatch(order) || !wire.enabled()) return;
  try { await wire.cancelPaymentIntent(pay.intentId); }
  catch (e) { await syncIntent(order.id, pay.intentId); } // succeeded бол markPaid энд биелнэ
}

/** Админ хүлээгдэж буй онлайн захиалгыг цуцлахад: нэхэмжлэхийг хааж, нөөцийг буцаана */
function cancelPending(orderId) {
  return withLock(orderId, async function () {
    let order = db.find("orders", orderId);
    if (!isOnline(order) || order.payment.status !== "pending") return;
    try { await closeIntent(order); } catch (e) { console.error("[Wire] нэхэмжлэх хаах алдаа:", e.code || e.message); }
    order = db.find("orders", orderId);
    if (order.payment.status !== "pending") return; // яг энэ үед төлөгдсөн — markPaid бүртгэсэн
    releaseStock(order.items);
    patchPayment(orderId, { status: "cancelled", cancelledAt: Date.now() });
  });
}

/** Админ төлбөрийг гараар (данс/бэлэн) хүлээн авсныг тэмдэглэх */
function markPaidManually(orderId) {
  return withLock(orderId, async function () {
    let order = db.find("orders", orderId);
    if (!isOnline(order)) throw userError("Энэ захиалга онлайн төлбөртэй биш.");
    if (order.payment.status === "paid") return db.find("orders", orderId);
    if (order.payment.status !== "pending" || order.status === "cancelled") {
      throw userError("Цуцлагдсан эсвэл хугацаа нь дууссан захиалгын төлбөрийг тэмдэглэх боломжгүй.");
    }
    try { await closeIntent(order); } catch (e) { console.error("[Wire] нэхэмжлэх хаах алдаа:", e.code || e.message); }
    order = db.find("orders", orderId);
    if (order.payment.status === "paid") return order; // QPay-ээр яг одоо төлөгдсөн
    const updated = patchPayment(orderId, { status: "paid", paidAt: Date.now(), paidManually: true });
    await sendSafe(updated.userEmail, mail.customerOrderEmail(updated), "Захиалагчийн");
    return updated;
  });
}

/* ------------------------------------------------------------------ */
/*  Хугацаа дуусгах ба reconcile                                       */
/* ------------------------------------------------------------------ */
/**
 * Цонх дууссан, идэвхтэй нэхэмжлэхгүй болсон төлөгдөөгүй захиалгыг цуцалж нөөцийг буцаана.
 * Админ төлвийг өөрчилсөн (confirmed гэх мэт) захиалгад оролцохгүй.
 */
function expireIfStale(orderId) {
  return withLock(orderId, async function () {
    let order = db.find("orders", orderId);
    if (!isOnline(order) || order.payment.status !== "pending") return false;
    if (order.status !== "new") return false;
    if (Date.now() - order.createdAt < PAY_WINDOW_MS) return false;
    const pay = order.payment;
    if (pay.intentId && !modeMismatch(order)) {
      const pi = await syncIntent(orderId, pay.intentId);
      if (pi.status === "succeeded") return false;
      if (pi.status !== "canceled") {
        // Худалдан авагч төлж байж магадгүй — нэхэмжлэхийн хугацаа дуусахыг хүлээнэ
        const deadline = pi.expires_at ? pi.expires_at * 1000 + INTENT_GRACE_MS : order.createdAt + PAY_WINDOW_MS + UNKNOWN_TTL_MS;
        if (Date.now() < deadline) return false;
        try { await wire.cancelPaymentIntent(pi.id); } catch (e) {
          const again = await syncIntent(orderId, pi.id);
          if (again.status !== "canceled") return false; // succeeded бол markPaid бүртгэсэн
        }
      }
    }
    order = db.find("orders", orderId); // await-ийн хооронд өөрчлөгдсөн эсэх
    if (!isOnline(order) || order.payment.status !== "pending" || order.status !== "new") return false;
    releaseStock(order.items);
    patchPayment(orderId, { status: "expired", expiredAt: Date.now() }, { status: "cancelled" });
    console.log("[Wire] Төлөгдөөгүй захиалга цуцлагдлаа:", order.code);
    return true;
  });
}

let reconciling = false;
async function reconcile() {
  if (reconciling || !wire.enabled()) return;
  reconciling = true;
  try {
    // Хамгийн удаан шалгагдаагүйгээс нь эхэлнэ — алдаатай захиалга бусдыгаа хаахгүй
    const pending = db.filter("orders", function (o) {
      return isOnline(o) && o.payment.status === "pending";
    }).sort(function (a, b) {
      return (lastCheck.get(a.id) || 0) - (lastCheck.get(b.id) || 0);
    }).slice(0, 25);
    for (const o of pending) {
      try {
        if (o.payment.intentId && !modeMismatch(o)) {
          // Саяхан (хэрэглэгч/webhook) шалгасан бол давхар дуудахгүй — lastCheck-ийг хөндөхгүй
          if (Date.now() - (lastCheck.get(o.id) || 0) >= CHECK_MIN_GAP_MS) {
            const pi = await syncIntent(o.id, o.payment.intentId);
            if (pi.status === "succeeded") continue;
          }
        } else {
          lastCheck.set(o.id, Date.now()); // Wire-аас шалгах зүйлгүй — дараалалд эргүүлнэ
        }
        await expireIfStale(o.id);
      } catch (e) {
        console.error("[Wire] reconcile алдаа:", o.code, e.code || e.message);
      }
    }
  } finally {
    reconciling = false;
  }
}

function startReconciler() {
  if (!wire.enabled()) {
    console.log("  Онлайн төлбөр (QPay): идэвхгүй — WIRE_API_KEY тохируулаагүй");
    return;
  }
  console.log("  Онлайн төлбөр (QPay): идэвхтэй · " +
    (wire.isLive() ? "LIVE — бодит мөнгө" : "TEST горим — зөвхөн админ туршина") +
    (process.env.WIRE_ADMIN_ONLY === "1" ? " · ЗӨВХӨН АДМИНД (WIRE_ADMIN_ONLY)" : ""));
  setTimeout(reconcile, 5000);
  setInterval(reconcile, RECONCILE_MS);
}

/* ------------------------------------------------------------------ */
/*  Webhook                                                            */
/* ------------------------------------------------------------------ */
async function handleWebhook(req, res) {
  const raw = await U.readRawBody(req, 1e6);
  const secret = wire.webhookSecret();
  let event;
  if (secret) {
    try {
      event = wire.verifyWebhook(raw, req.headers[wire.SIGNATURE_HEADER], secret);
    } catch (e) {
      console.warn("[Wire] webhook татгалзлаа:", e.message);
      return U.sendError(res, 400, "bad signature");
    }
  } else {
    // Нууц тохируулаагүй: endpoint баталгаажуулах ping-д л 200 (юу ч өөрчлөхгүй)
    let parsed = {};
    try { parsed = JSON.parse(raw.toString("utf8")); } catch (e) {}
    if (parsed && parsed.type === "endpoint.verification") return U.sendJson(res, 200, { received: true });
    console.warn("[Wire] WIRE_WEBHOOK_SECRET тохируулаагүй — webhook-ийг алгаслаа");
    return U.sendError(res, 503, "webhook not configured");
  }

  // Эхлээд боловсруулна; алдаа гарвал 5xx буцааж Wire-ээр дахин илгээлгэнэ
  try {
    await processEvent(event);
  } catch (e) {
    console.error("[Wire] webhook боловсруулах алдаа:", e.code || e.message);
    return U.sendError(res, 500, "processing failed");
  }
  return U.sendJson(res, 200, { received: true });
}

async function processEvent(event) {
  if (!event || typeof event.type !== "string" || event.type.indexOf("payment_intent.") !== 0) return;
  const data = event.data || {};
  const obj = data.object && typeof data.object === "object" ? data.object : data;
  const intentId = obj.object === "payment_intent" ? obj.id : (obj.payment_intent || obj.id);
  if (!intentId || typeof intentId !== "string") return;
  // Үнэний эх сурвалж — API-аас дахин татна (өөр горим/project-ийн id бол 404 болж зогсоно)
  let pi;
  try { pi = await wire.retrievePaymentIntent(intentId); }
  catch (e) { if (e && e.status === 404) return; throw e; }
  const orderId = pi.metadata && pi.metadata.order_id;
  const order = orderId && db.find("orders", orderId);
  if (!order) return console.warn("[Wire] webhook: захиалга олдсонгүй", intentId);
  lastCheck.set(order.id, Date.now());
  if (pi.status === "succeeded") markPaid(order.id, pi);
  else if (order.payment && order.payment.intentId === pi.id && order.payment.intentStatus !== pi.status) {
    patchPayment(order.id, { intentStatus: pi.status, intentExpiresAt: pi.expires_at || null });
  }
}

module.exports = {
  enabled: wire.enabled,
  isLive: wire.isLive,
  onlineAllowed,
  reserveStock,
  releaseStock,
  notifyOrderPlaced,
  startPayment,
  paymentStatus,
  cancelPending,
  markPaidManually,
  handleWebhook,
  startReconciler,
  reconcile,
  expireIfStale,
  markPaid,
};
