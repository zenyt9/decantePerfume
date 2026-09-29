/**
 * lib/wire.js — Wire (wire.mn) төлбөрийн API-ийн клиент
 * =====================================================================
 * QPay зэрэг операторыг Wire-ээр дамжуулж холбоно. Нэмэлт npm сангүй —
 * Node-ийн fetch, crypto-г ашиглана (албан ёсны @buildry-wire/wire SDK-тай
 * ижил гэрээтэй: Bearer key, JSON body, POST-д Idempotency-Key, HMAC webhook).
 *
 * Орчны хувьсагч:
 *   WIRE_API_KEY        — sk_test_… (туршилт) эсвэл sk_live_… (бодит мөнгө)
 *   WIRE_WEBHOOK_SECRET — webhook endpoint-ийн гарын үсгийн нууц (whsec_…)
 *   WIRE_OPERATORS      — (заавал биш) зөвшөөрөх операторууд, ж: "qpay".
 *                         Хоосон бол Wire идэвхтэй оператороос автоматаар сонгоно.
 *
 * Мөнгө: дүнг БҮХЭЛ ТӨГРӨГӨӨР илгээнэ (AMOUNT_FACTOR = 1).
 *   АНХААР: Wire-ийн API баримтад "minor unit, 50000 = 500.00₮" гэж бичсэн ч бодит
 *   (live) систем дүнг шууд төгрөгөөр авдаг нь 2026-09-29-ний бодит туршилтаар
 *   батлагдсан — 6,000₮-ийг ×100 илгээхэд төлбөрийн хуудас 600,000₮ харуулсан.
 *   (Төлбөрийн линкийн баримт ч "бүхэл төгрөг" гэдэг.) Үүнийг хэзээ ч бүү өөрчил.
 */
"use strict";
const crypto = require("crypto");

const BASE_URL = (process.env.WIRE_API_BASE || "https://api.wire.mn").replace(/\/+$/, "");
const AMOUNT_FACTOR = 1;
const SIGNATURE_HEADER = "wirepayment-signature"; // Node header-ийг жижиг үсгээр өгдөг
const TOLERANCE_SEC = 300;
const TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;

function apiKey() { return String(process.env.WIRE_API_KEY || "").trim(); }
function webhookSecret() { return String(process.env.WIRE_WEBHOOK_SECRET || "").trim(); }

/** Онлайн төлбөр ажиллах боломжтой эсэх (зөв хэлбэрийн key тохируулсан) */
function enabled() { return /^sk_(test|live)_/.test(apiKey()); }
/** Бодит (live) горим эсэх. TEST түлхүүртэй үед payments модуль онлайн төлбөрийг
    зөвхөн админд зөвшөөрч, тест төлбөрийг "ТЕСТ" гэж тэмдэглэнэ. */
function isLive() { return apiKey().indexOf("sk_live_") === 0; }

function operators() {
  return String(process.env.WIRE_OPERATORS || "")
    .split(",").map(function (s) { return s.trim(); }).filter(Boolean);
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/** Wire API-ийн алдаа — code, status, requestId-тай */
class WireError extends Error {
  constructor(message, info) {
    super(message);
    this.name = "WireError";
    info = info || {};
    this.code = info.code || "";
    this.status = info.status || 0;
    this.requestId = info.requestId || "";
  }
}

/**
 * API дуудлага. POST бүрд idempotency key заавал (давтан оролдлого аюулгүй).
 * 429/5xx/сүлжээний алдаанд exponential backoff-оор дахин оролдоно.
 */
async function request(method, path, body, idempotencyKey) {
  if (!enabled()) throw new WireError("Онлайн төлбөр тохируулагдаагүй байна.", { code: "not_configured" });
  const headers = { Authorization: "Bearer " + apiKey(), Accept: "application/json" };
  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  if (method === "POST") headers["Idempotency-Key"] = idempotencyKey || ("idk_" + crypto.randomBytes(16).toString("hex"));

  for (let attempt = 0; ; attempt++) {
    let resp;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
      try {
        resp = await fetch(BASE_URL + path, { method: method, headers: headers, body: payload, signal: ctrl.signal });
      } finally { clearTimeout(timer); }
    } catch (e) {
      if (attempt < MAX_RETRIES) { await sleep(500 * Math.pow(2, attempt)); continue; }
      throw new WireError("Төлбөрийн системтэй холбогдож чадсангүй.", { code: "network_error" });
    }
    // 409 idempotency_in_flight — эхний хүсэлт дуусахыг хүлээгээд дахин
    if ((resp.status === 429 || resp.status >= 500 || resp.status === 409) && attempt < MAX_RETRIES) {
      const ra = parseInt(resp.headers.get("retry-after") || "", 10);
      await sleep(isFinite(ra) && ra > 0 ? ra * 1000 : 700 * Math.pow(2, attempt));
      continue;
    }
    const text = await resp.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
    if (resp.ok) return json;
    const err = (json && json.error) || {};
    throw new WireError(err.message || ("Wire API алдаа (" + resp.status + ")"), {
      code: err.code, status: resp.status, requestId: err.request_id,
    });
  }
}

/** Төлбөрийн хүсэлт (PaymentIntent) үүсгэх. amountTugrik — бүхэл төгрөг. */
function createPaymentIntent(opts) {
  const body = {
    amount: Math.round(opts.amountTugrik) * AMOUNT_FACTOR,
    currency: "MNT",
    description: String(opts.description || "").slice(0, 500),
    metadata: opts.metadata || {},
  };
  const ops = operators();
  if (ops.length) body.allowed_operators = ops;
  return request("POST", "/v1/payment_intents", body, opts.idempotencyKey);
}

/** Hosted checkout session (pay.wire.mn/c/… хуудас — QR + банкны апп) */
function createCheckoutSession(opts) {
  const body = { payment_intent: opts.paymentIntent };
  if (opts.successUrl) body.success_url = opts.successUrl;
  if (opts.cancelUrl) body.cancel_url = opts.cancelUrl;
  return request("POST", "/v1/checkout/sessions", body, opts.idempotencyKey);
}

function retrievePaymentIntent(id) {
  return request("GET", "/v1/payment_intents/" + encodeURIComponent(id));
}

function cancelPaymentIntent(id) {
  return request("POST", "/v1/payment_intents/" + encodeURIComponent(id) + "/cancel", {}, "cancel-" + id);
}

/**
 * Webhook-ийн гарын үсэг шалгах. Header: "t=<unix>,v1=<hex>".
 * v1 = HMAC_SHA256(secret, t + "." + rawBody). Амжилттай бол event объект буцаана,
 * үгүй бол алдаа шиднэ. rawBody — задлаагүй Buffer (байт нэг ч өөрчлөгдөх ёсгүй).
 */
function verifyWebhook(rawBody, header, secret, nowSec) {
  if (!secret) throw new Error("webhook secret тохируулагдаагүй");
  let t, v1;
  String(header || "").split(",").forEach(function (part) {
    const i = part.indexOf("=");
    if (i < 0) return;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = parseInt(v, 10);
    else if (k === "v1") v1 = v;
  });
  if (!isFinite(t) || !v1) throw new Error("гарын үсгийн header буруу");
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > TOLERANCE_SEC) throw new Error("timestamp хүлцлээс гадуур");
  const expected = crypto.createHmac("sha256", secret).update(t + ".").update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("гарын үсэг таарсангүй");
  return JSON.parse(rawBody.toString("utf8"));
}

module.exports = {
  enabled, isLive, webhookSecret,
  createPaymentIntent, createCheckoutSession, retrievePaymentIntent, cancelPaymentIntent,
  verifyWebhook, WireError, AMOUNT_FACTOR, SIGNATURE_HEADER,
};
