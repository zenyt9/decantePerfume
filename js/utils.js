/**
 * utils.js — Туслах жижиг функцууд
 * =====================================================================
 * Бүх файлд ашиглагдах жижиг хэрэгслүүд: үнэ форматлах, localStorage,
 * toast мэдэгдэл, DOM богиносгол, escape гэх мэт.
 */
window.PM = window.PM || {};

PM.utils = (function () {
  "use strict";

  /** Тоог мянгатаар тусгаарлаж, ₮ тэмдэгтэй болгож форматлана. Ж: 25000 → "25,000₮" */
  function formatPrice(value) {
    var cfg = PM.CONFIG.currency;
    var num = Number(value) || 0;
    return num.toLocaleString(cfg.locale) + cfg.symbol;
  }

  /** DOM элемент богино сонголт */
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** HTML тусгай тэмдэгтүүдийг аюулгүй болгож escape хийнэ */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Функцийн дуудалтыг хойшлуулагч (хайлт зэрэгт ашиглана) */
  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  }

  /** localStorage-ийн аюулгүй боодол (private горимд алдаа өгөхөөс сэргийлнэ) */
  var storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* private горим — алгасна */ }
    },
  };

  /** Дэлгэцийн буланд түр мэдэгдэл (toast) харуулна */
  function toast(message, type) {
    var root = qs("#toast-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast toast--" + (type || "success");
    el.setAttribute("role", "status");
    el.innerHTML =
      '<span class="toast__icon" aria-hidden="true"></span>' +
      '<span class="toast__msg">' + escapeHtml(message) + "</span>";
    root.appendChild(el);
    // Дэлгэцэнд орж ирэх animation
    requestAnimationFrame(function () { el.classList.add("is-visible"); });
    // 3 секундын дараа автоматаар арилна
    setTimeout(function () {
      el.classList.remove("is-visible");
      setTimeout(function () { el.remove(); }, 350);
    }, 3000);
  }

  /** Текстийг clipboard-д хуулна (Promise буцаана) */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Хуучин browser-ийн нөөц арга
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        resolve();
      } catch (e) { reject(e); }
    });
  }

  return {
    formatPrice: formatPrice,
    qs: qs,
    qsa: qsa,
    escapeHtml: escapeHtml,
    debounce: debounce,
    storage: storage,
    toast: toast,
    copyText: copyText,
  };
})();
