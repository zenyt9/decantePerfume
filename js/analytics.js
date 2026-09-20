/**
 * analytics.js — Cookie зөвшөөрөл + маркетингийн хэмжүүр
 * =====================================================================
 * config.js-ийн ДАРАА ачаалагдана. Хэрэглэгч зөвшөөрөл өгсөн тохиолдолд л
 * Google Analytics / Facebook Pixel-ийг ачаална (config.analytics-д ID бий бол).
 * Заавал шаардлагатай (нэвтрэлтийн) cookie нь зөвшөөрлөөс үл хамааран ажиллана.
 */
(function () {
  "use strict";
  var KEY = "dc_cookie_consent";

  function loadTrackers() {
    var a = (window.PM && PM.CONFIG && PM.CONFIG.analytics) || {};
    if (a.ga4) {
      var g = document.createElement("script");
      g.async = true;
      g.src = "https://www.googletagmanager.com/gtag/js?id=" + a.ga4;
      document.head.appendChild(g);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", a.ga4);
    }
    if (a.fbPixel) {
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", a.fbPixel);
      window.fbq("track", "PageView");
    }
  }

  var consent = null;
  try { consent = localStorage.getItem(KEY); } catch (e) {}

  if (consent === "yes") loadTrackers();

  var banner = document.getElementById("cookie-banner");
  if (banner && !consent) banner.hidden = false;

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-cookie]") : null;
    if (!btn) return;
    var v = btn.getAttribute("data-cookie");
    try { localStorage.setItem(KEY, v === "accept" ? "yes" : "no"); } catch (e2) {}
    if (banner) banner.hidden = true;
    if (v === "accept") loadTrackers();
  });
})();
