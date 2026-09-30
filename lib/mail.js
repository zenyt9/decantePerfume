/**
 * lib/mail.js — И-мэйл илгээгч (Resend HTTP API)
 * =====================================================================
 * Нэмэлт npm сангүй — Node-ийн fetch ашиглан Resend руу илгээнэ.
 *
 * Орчны хувьсагч:
 *   RESEND_API_KEY — Resend-ийн түлхүүр (re_...)
 *   MAIL_FROM      — Илгээгч, ж: "Décante <noreply@decanteperfume.com>"
 *
 * RESEND_API_KEY тохируулаагүй бол (локал хөгжүүлэлт) и-мэйл илгээхгүй,
 * зөвхөн серверийн лог руу гаргана — ингэснээр кодыг лог дээрээс харж
 * туршиж болно.
 */
"use strict";

async function sendMail(opts) {
  var key = process.env.RESEND_API_KEY;
  var from = process.env.MAIL_FROM || "Décante <onboarding@resend.dev>";

  if (!key) {
    console.log("──────── [MAIL · DEV горим] ────────");
    console.log("  Хүлээн авагч:", opts.to);
    console.log("  Гарчиг      :", opts.subject);
    console.log("  (RESEND_API_KEY алга тул илгээгээгүй. Кодыг дээрх гарчгаас хараарай.)");
    console.log("────────────────────────────────────");
    return { dev: true };
  }

  var res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json",
    },
    // noreply@ хаягаас илгээдэг тул үйлчлүүлэгчийн "Хариу бичих" нь эзний шуудан руу очно
    body: JSON.stringify({
      from: from, to: opts.to, subject: opts.subject, html: opts.html,
      reply_to: process.env.REPLY_TO || process.env.OWNER_EMAIL || "decanteperfume71@gmail.com",
    }),
  });
  if (!res.ok) {
    var text = "";
    try { text = await res.text(); } catch (e) {}
    throw new Error("И-мэйл илгээхэд алдаа гарлаа (" + res.status + ") " + text);
  }
  return res.json();
}

/* И-мэйлийн толгой дахь лого (сайтаас PNG-ээр ачаална — SVG-г Gmail харуулдаггүй).
   Зураг ачаалагдаагүй үед alt текст нь брэндийн нэрээр харагдана. */
var SITE_URL = (process.env.SITE_URL || "https://decanteperfume.com").replace(/\/+$/, "");
function brandHeader() {
  return '<div style="text-align:center;margin:0 0 20px">' +
    '<img src="' + SITE_URL + '/assets/email-logo.png" width="260" height="64" alt="Décante" ' +
    'style="display:inline-block;width:260px;height:64px;border:0;outline:none;' +
    'font-family:Georgia,serif;font-size:24px;letter-spacing:4px;color:#8c6d3f">' +
    '</div>';
}

/** OTP и-мэйлийн гарчиг + HTML бэлдэнэ */
function otpEmail(code, purpose) {
  var title = purpose === "reset" ? "Нууц үг сэргээх код" : "И-мэйл баталгаажуулах код";
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:32px;' +
      'background:#faf7f2;border-radius:14px;color:#1d1a16">' +
      brandHeader() +
      '<p style="margin:0 0 22px;color:#57514a">' + title + '</p>' +
      '<div style="font-size:38px;font-weight:700;letter-spacing:10px;text-align:center;' +
        'background:#fff;border:1px solid #e8e0d4;border-radius:12px;padding:20px 10px;margin:0 0 20px">' +
        code + '</div>' +
      '<p style="color:#8a827a;font-size:14px;margin:0;line-height:1.6">Энэ кодыг сайт дээр оруулна уу. Код <b>10 минутын</b> турш хүчинтэй. ' +
      'Хэрэв та код хүсээгүй бол энэ и-мэйлийг хэрэгсэхгүй байж болно.</p>' +
    '</div>';
  return { subject: "Décante — " + title + ": " + code, html: html };
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function mnt(n) { return (Number(n) || 0).toLocaleString("en-US") + "₮"; }

/** Захиалгын төлбөрийн байдал:
    "online" — QPay-ээр бодит төлбөр, "test" — ТЕСТ төлбөр (мөнгө ороогүй),
    "manual" — админ гараар хүлээн авсан, "unpaid" — төлөгдөөгүй */
function payState(order) {
  var p = order.payment;
  if (!p || p.method !== "qpay" || p.status !== "paid") return "unpaid";
  if (p.paidManually) return "manual";
  return p.livemode === false ? "test" : "online";
}
function isPaid(order) { return payState(order) !== "unpaid"; }

/* Захиалагчид харагдах явцын алхмууд (сайтын "Миний захиалга"-тай ижил нэрээр) */
var STEPS = [
  ["packing", "Баглаж байна"],
  ["packed", "Багласан"],
  ["delivering", "Хүргэлтэд гарсан"],
  ["done", "Хүргэгдсэн"],
];
/** И-мэйлд явцын мөр: өнгөрсөн болон одоогийн алхам алтлаг, дараагийнх нь бүдэг */
function progressHtml(status) {
  var idx = -1;
  STEPS.forEach(function (s, i) { if (s[0] === status) idx = i; });
  if (idx < 0) return "";
  var cells = STEPS.map(function (s, i) {
    var on = i <= idx;
    return '<td style="width:25%;text-align:center;vertical-align:top;padding:0 2px">' +
      '<div style="width:14px;height:14px;margin:0 auto 6px;border-radius:50%;box-sizing:border-box;' +
        (on ? "background:#8c6d3f;border:2px solid #8c6d3f" : "background:#fff;border:2px solid #d9cfc0") + '"></div>' +
      '<div style="font-size:11px;line-height:1.3;' +
        (i === idx ? "color:#1d1a16;font-weight:700" : on ? "color:#57514a" : "color:#a39a8f") + '">' + s[1] + "</div></td>";
  }).join("");
  return '<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 18px"><tr>' + cells + "</tr></table>";
}
var ORDERS_HINT = "Захиалгынхаа явцыг сайтын “Миний захиалга” хэсгээс хэдийд ч харах боломжтой.";

/** Эзэн (дэлгүүр)-д илгээх шинэ захиалгын мэдэгдэл */
function orderEmail(order) {
  var rows = order.items.map(function (it) {
    return '<tr><td style="padding:6px 0">' + esc(it.brand + " " + it.name) +
      " · " + it.ml + "мл × " + it.qty + '</td>' +
      '<td style="text-align:right;padding:6px 0">' + mnt(it.lineTotal) + "</td></tr>";
  }).join("");
  var c = order.customer;
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:28px;' +
      'background:#faf7f2;border-radius:14px;color:#1d1a16">' +
      '<h2 style="font-family:Georgia,serif;margin:0 0 4px;color:#8c6d3f">🛍 Шинэ захиалга — ' + esc(order.code) + '</h2>' +
      '<p style="color:#57514a;margin:0 0 16px;font-size:14px">' + esc(new Date(order.createdAt).toLocaleString()) + '</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows +
        '<tr><td style="border-top:1px solid #e8e0d4;padding-top:8px">Хүргэлт</td>' +
          '<td style="border-top:1px solid #e8e0d4;padding-top:8px;text-align:right">' +
          (order.deliveryFee === 0 ? "Үнэгүй" : mnt(order.deliveryFee)) + "</td></tr>" +
        '<tr><td style="font-weight:700;padding-top:6px">Нийт</td>' +
          '<td style="font-weight:700;padding-top:6px;text-align:right">' + mnt(order.total) + "</td></tr>" +
      "</table>" +
      ({
        online: '<div style="margin-top:14px;padding:10px 14px;border-radius:10px;background:#e4efe0;color:#2f5236;font-size:14px;font-weight:700">' +
          "✅ QPay-ээр төлөгдсөн: " + mnt(order.total) + "</div>",
        test: '<div style="margin-top:14px;padding:10px 14px;border-radius:10px;background:#e7eefc;color:#2f4a8f;font-size:14px;font-weight:700">' +
          "🧪 ТЕСТ төлбөр. Бодит мөнгө ороогүй тул энэ захиалгыг хүргэж болохгүй.</div>",
        manual: '<div style="margin-top:14px;padding:10px 14px;border-radius:10px;background:#e4efe0;color:#2f5236;font-size:14px;font-weight:700">' +
          "✅ Төлбөрийг гараар хүлээн авсан: " + mnt(order.total) + "</div>",
        unpaid: '<div style="margin-top:14px;padding:10px 14px;border-radius:10px;background:#fdf0d8;color:#7a5c14;font-size:14px">' +
          "Төлбөр: <b>онлайнаар төлөгдөөгүй</b>. Төлбөрийн асуудлыг захиалагчтай тохиролцоно уу.</div>",
      })[payState(order)] +
      // Төлбөр орсон бодит захиалга — баглах ээлжтэй
      (isPaid(order) && payState(order) !== "test" && order.status === "packing"
        ? '<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#57514a">' +
            "📦 Захиалга “Баглаж байна” төлөвт орлоо. Баглаж дуусмагц админ самбараас төлвийг нь “Багласан” болгоорой.</p>"
        : "") +
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #e8e0d4;font-size:14px;color:#57514a">' +
        "<b>" + esc(c.name) + "</b><br>" + esc(c.phone) + "<br>" + esc(c.address || "") +
        (c.note ? "<br>Тэмдэглэл: " + esc(c.note) : "") + "</div>" +
    "</div>";
  return {
    subject: (payState(order) === "test" ? "[ТЕСТ] " : "") + "Шинэ захиалга " + order.code + " — " + mnt(order.total) +
      ({ online: " · ТӨЛСӨН", test: " · мөнгө ороогүй", manual: " · ТӨЛСӨН", unpaid: " · ТӨЛӨГДӨӨГҮЙ" })[payState(order)],
    html: html,
  };
}

/** Захиалагчид (үйлчлүүлэгчид) илгээх захиалга хүлээн авсан баталгаажуулга */
function customerOrderEmail(order) {
  var rows = order.items.map(function (it) {
    return '<tr><td style="padding:6px 0">' + esc(it.brand + " " + it.name) +
      " · " + it.ml + "мл × " + it.qty + '</td>' +
      '<td style="text-align:right;padding:6px 0">' + mnt(it.lineTotal) + "</td></tr>";
  }).join("");
  var c = order.customer;
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:28px;' +
      'background:#faf7f2;border-radius:14px;color:#1d1a16">' +
      brandHeader() +
      (payState(order) === "test"
        ? '<p style="margin:0 0 14px;padding:8px 12px;border-radius:8px;background:#e7eefc;color:#2f4a8f;font-size:13px;font-weight:700">' +
            "🧪 ТЕСТ: Энэ бол туршилтын төлбөр. Бодит мөнгө шилжээгүй.</p>"
        : "") +
      '<p style="margin:0 0 18px;color:#57514a">' + (isPaid(order)
        ? "Сайн байна уу! Таны төлбөр амжилттай орж, захиалга баталгаажлаа. Бид захиалгыг тань одоо баглаж байна. Биднийг сонгосонд баярлалаа."
        : "Сайн байна уу! Таны захиалгыг хүлээн авлаа. Биднийг сонгосонд баярлалаа.") + "</p>" +
      (isPaid(order) ? progressHtml(order.status === "confirmed" ? "packing" : order.status) : "") +
      '<div style="background:#fff;border:1px solid #e8e0d4;border-radius:12px;padding:16px 18px;margin:0 0 18px">' +
        '<p style="margin:0 0 10px;font-size:14px;color:#8a827a">Захиалгын дугаар</p>' +
        '<p style="margin:0 0 14px;font-size:20px;font-weight:700;letter-spacing:1px">' + esc(order.code) + '</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows +
          '<tr><td style="border-top:1px solid #e8e0d4;padding-top:8px">Хүргэлт</td>' +
            '<td style="border-top:1px solid #e8e0d4;padding-top:8px;text-align:right">' +
            (order.deliveryFee === 0 ? "Үнэгүй" : mnt(order.deliveryFee)) + "</td></tr>" +
          '<tr><td style="font-weight:700;padding-top:6px">Нийт</td>' +
            '<td style="font-weight:700;padding-top:6px;text-align:right">' + mnt(order.total) + "</td></tr>" +
        "</table>" +
      "</div>" +
      '<p style="color:#57514a;font-size:14px;line-height:1.6;margin:0 0 16px">' +
        (isPaid(order)
          ? '<b>Төлбөр:</b> ' + (payState(order) === "manual" ? "" : "QPay-ээр ") + mnt(order.total) + ' төлөгдсөн.<br>' +
            '<b>Дараагийн алхам:</b> Захиалга тань хүргэлтэд гармагц бид танд и-мэйлээр мэдэгдэнэ. ' +
            ORDERS_HINT + ' Асуух зүйл гарвал энэ и-мэйлд хариу бичээрэй.'
          : '<b>Дараагийн алхам:</b> Бид удахгүй тантай утсаар эсвэл мессенжерээр холбогдож, ' +
            'төлбөр болон хүргэлтийн талаар тохиролцоно. ' + ORDERS_HINT +
            ' Асуух зүйл гарвал энэ и-мэйлд хариу бичээрэй.') + '</p>' +
      '<div style="padding-top:14px;border-top:1px solid #e8e0d4;font-size:13px;color:#8a827a">' +
        'Хүлээн авагч: ' + esc(c.name) + ' · ' + esc(c.phone) +
        (c.address ? "<br>Хаяг: " + esc(c.address) : "") + "</div>" +
    "</div>";
  return {
    subject: (payState(order) === "test" ? "[ТЕСТ] " : "") +
      "Décante — Захиалга " + order.code + (isPaid(order) ? " төлөгдөж баталгаажлаа" : " хүлээн авлаа"),
    html: html,
  };
}

/** Эзэнд: цуцлагдсан захиалгад QPay төлбөр орж ирсэн — буцаан олгох шаардлагатай */
function paidAfterCancelEmail(order) {
  var c = order.customer;
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:28px;' +
      'background:#faf7f2;border-radius:14px;color:#1d1a16">' +
      '<h2 style="font-family:Georgia,serif;margin:0 0 10px;color:#a8322c">⚠️ Цуцлагдсан захиалгад төлбөр орж ирлээ</h2>' +
      '<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#57514a"><b>' + esc(order.code) +
        '</b> дугаартай захиалгыг цуцалсны дараа захиалагч QPay-ээр <b>' + mnt(order.total) + '</b> төлсөн байна. ' +
        'Захиалгыг сэргээж хүргэх, эсвэл мөнгийг нь буцаан олгоно уу.</p>' +
      '<p style="margin:0;font-size:14px;color:#57514a"><b>' + esc(c.name) + '</b> · ' + esc(c.phone) + '</p>' +
    '</div>';
  return { subject: "⚠️ Буцаан олголт шаардлагатай — " + order.code + " · " + mnt(order.total), html: html };
}

/** Захиалгын төлөв өөрчлөгдөхөд захиалагчид илгээх мэдэгдэл.
    Зөвхөн хүргэлтэд гарсан / хүргэгдсэн / цуцлагдсан үед; "packing", "packed"
    (баглах шат) дээр и-мэйл явуулахгүй — null буцаана. */
function orderStatusEmail(order, status) {
  var map = {
    delivering: { title: "Захиалга хүргэлтэд гарлаа", msg: "Таны захиалга хүргэлтэд гарлаа. Удахгүй гарт тань очих тул утсаа ойрхон байлгаарай.", color: "#8a6d1f", hint: true },
    done:       { title: "Захиалга хүргэгдлээ", msg: "Таны захиалга хүргэгдлээ. Шинэ үнэртэй ус тань таалагдана гэж найдаж байна. Биднээр үйлчлүүлсэнд баярлалаа! 🌸", color: "#3a5a40" },
    cancelled:  { title: "Захиалга цуцлагдлаа", msg: "Таны захиалга цуцлагдлаа. Асуух зүйл байвал 5056-9921 дугаарт залгаарай, эсвэл энэ и-мэйлд хариу бичээрэй.", color: "#a8322c" },
  };
  var m = map[status];
  if (!m) return null;
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:30px;' +
      'background:#faf7f2;border-radius:14px;color:#1d1a16">' +
      brandHeader() +
      '<div style="display:inline-block;margin:8px 0 18px;padding:6px 14px;border-radius:100px;' +
        'font-size:14px;font-weight:700;color:#fff;background:' + m.color + '">' + esc(m.title) + '</div>' +
      '<p style="margin:0 0 16px;color:#57514a;font-size:15px;line-height:1.6">' + esc(m.msg) +
        (m.hint ? " " + esc(ORDERS_HINT) : "") + '</p>' +
      progressHtml(status) +
      '<div style="background:#fff;border:1px solid #e8e0d4;border-radius:12px;padding:14px 18px">' +
        '<p style="margin:0;font-size:13px;color:#8a827a">Захиалгын дугаар</p>' +
        '<p style="margin:4px 0 0;font-size:19px;font-weight:700;letter-spacing:1px">' + esc(order.code) + '</p>' +
        '<p style="margin:10px 0 0;font-size:14px;color:#57514a">Нийт: <b>' + mnt(order.total) + '</b></p>' +
      '</div>' +
    '</div>';
  return { subject: "Décante — " + m.title + " (" + order.code + ")", html: html };
}

module.exports = {
  sendMail: sendMail,
  otpEmail: otpEmail,
  orderEmail: orderEmail,
  customerOrderEmail: customerOrderEmail,
  orderStatusEmail: orderStatusEmail,
  paidAfterCancelEmail: paidAfterCancelEmail,
};
