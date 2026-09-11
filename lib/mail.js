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

module.exports = { sendMail: sendMail, otpEmail: otpEmail, orderEmail: orderEmail };
