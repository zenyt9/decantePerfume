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
    body: JSON.stringify({ from: from, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) {
    var text = "";
    try { text = await res.text(); } catch (e) {}
    throw new Error("И-мэйл илгээхэд алдаа гарлаа (" + res.status + ") " + text);
  }
  return res.json();
}

/** OTP и-мэйлийн гарчиг + HTML бэлдэнэ */
function otpEmail(code, purpose) {
  var title = purpose === "reset" ? "Нууц үг сэргээх код" : "И-мэйл баталгаажуулах код";
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:32px;' +
      'background:#faf7f2;border-radius:14px;color:#1d1a16">' +
      '<h1 style="font-family:Georgia,serif;color:#8c6d3f;margin:0 0 6px">Décante</h1>' +
      '<p style="margin:0 0 22px;color:#57514a">' + title + '</p>' +
      '<div style="font-size:38px;font-weight:700;letter-spacing:10px;text-align:center;' +
        'background:#fff;border:1px solid #e8e0d4;border-radius:12px;padding:20px 10px;margin:0 0 20px">' +
        code + '</div>' +
      '<p style="color:#8a827a;font-size:14px;margin:0;line-height:1.6">Энэ код <b>10 минут</b> хүчинтэй. ' +
      'Хэрэв та энэ үйлдлийг хийгээгүй бол и-мэйлийг үл тоомсорлоно уу.</p>' +
    '</div>';
  return { subject: "Décante — " + title + ": " + code, html: html };
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function mnt(n) { return (Number(n) || 0).toLocaleString("en-US") + "₮"; }

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
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #e8e0d4;font-size:14px;color:#57514a">' +
        "<b>" + esc(c.name) + "</b><br>" + esc(c.phone) + "<br>" + esc(c.address || "") +
        (c.note ? "<br>Тэмдэглэл: " + esc(c.note) : "") + "</div>" +
    "</div>";
  return { subject: "Шинэ захиалга " + order.code + " — " + mnt(order.total), html: html };
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
      '<h1 style="font-family:Georgia,serif;color:#8c6d3f;margin:0 0 4px">Décante</h1>' +
      '<p style="margin:0 0 18px;color:#57514a">Таны захиалгыг хүлээн авлаа. Баярлалаа! 🌸</p>' +
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
        '<b>Дараагийн алхам:</b> Бид тантай удахгүй утас эсвэл мессенжерээр холбогдож, ' +
        'төлбөр болон хүргэлтийг зохицуулна. Асуулт байвал энэ и-мэйлд хариу бичээрэй.</p>' +
      '<div style="padding-top:14px;border-top:1px solid #e8e0d4;font-size:13px;color:#8a827a">' +
        'Хүлээн авагч: ' + esc(c.name) + ' · ' + esc(c.phone) +
        (c.address ? "<br>Хаяг: " + esc(c.address) : "") + "</div>" +
    "</div>";
  return { subject: "Décante — Захиалга " + order.code + " хүлээн авлаа", html: html };
}

/** Захиалгын төлөв өөрчлөгдөхөд захиалагчид илгээх мэдэгдэл */
function orderStatusEmail(order, status) {
  var map = {
    confirmed:  { title: "Захиалга баталгаажлаа", msg: "Таны захиалгыг хүлээн авч баталгаажууллаа. Удахгүй хүргэлтэд бэлдэнэ.", color: "#3a5a40" },
    delivering: { title: "Захиалга хүргэлтэд гарлаа", msg: "Таны захиалга хүргэлтэд гарлаа — удахгүй хүлээн авна. Утсаа нээлттэй байлгаарай.", color: "#8a6d1f" },
    done:       { title: "Захиалга хүргэгдлээ", msg: "Таны захиалга амжилттай хүргэгдлээ. Үйлчлүүлсэнд баярлалаа — дахин уулзацгаая! 🌸", color: "#3a5a40" },
    cancelled:  { title: "Захиалга цуцлагдлаа", msg: "Таны захиалга цуцлагдлаа. Асуулт эсвэл эргэлзээ байвал бидэнтэй холбогдоно уу.", color: "#a8322c" },
  };
  var m = map[status];
  if (!m) return null;
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:30px;' +
      'background:#faf7f2;border-radius:14px;color:#1d1a16">' +
      '<h1 style="font-family:Georgia,serif;color:#8c6d3f;margin:0 0 4px">Décante</h1>' +
      '<div style="display:inline-block;margin:8px 0 18px;padding:6px 14px;border-radius:100px;' +
        'font-size:14px;font-weight:700;color:#fff;background:' + m.color + '">' + esc(m.title) + '</div>' +
      '<p style="margin:0 0 16px;color:#57514a;font-size:15px;line-height:1.6">' + esc(m.msg) + '</p>' +
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
};
