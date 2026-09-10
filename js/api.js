/**
 * api.js — Backend API-тай харилцах давхарга (frontend)
 * =====================================================================
 * Бүх сервер рүү хийх хүсэлт эндүүр дамжина. Cookie автоматаар илгээгдэнэ
 * (нэвтрэлтийн session). Алдаа гарвал сервер өгсөн Монгол мессежийг шиднэ.
 */
window.PM = window.PM || {};

PM.api = (function () {
  "use strict";
  var BASE = "/api";

  async function request(method, path, body) {
    var opts = {
      method: method,
      headers: {},
      credentials: "same-origin",
    };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(BASE + path, opts);
    var data = null;
    try { data = await res.json(); } catch (e) { /* биегүй хариу */ }
    if (!res.ok) {
      var err = new Error((data && data.error) || ("Алдаа гарлаа (" + res.status + ")"));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    get: function (p) { return request("GET", p); },
    post: function (p, b) { return request("POST", p, b || {}); },
    patch: function (p, b) { return request("PATCH", p, b || {}); },
    del: function (p) { return request("DELETE", p); },
  };
})();
