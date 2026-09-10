/**
 * admin.js — Админ самбар (self-contained SPA)
 * =====================================================================
 * Бүтээгдэхүүн, брэнд, захиалгыг удирдах хяналтын самбар.
 * Зөвхөн role === "admin" хэрэглэгч нэвтэрнэ.
 *
 * Ашигладаг: PM.api, PM.utils, PM.CONFIG
 */
(function () {
  "use strict";
  var u = PM.utils;
  var fmt = u.formatPrice;
  var esc = u.escapeHtml;

  var SIZES = [5, 10, 20];
  var STATUS = {
    new:        { label: "Шинэ",         cls: "st-new" },
    confirmed:  { label: "Баталгаажсан", cls: "st-confirmed" },
    delivering: { label: "Хүргэлтэд",    cls: "st-delivering" },
    done:       { label: "Дууссан",      cls: "st-done" },
    cancelled:  { label: "Цуцлагдсан",   cls: "st-cancelled" },
  };
  var STATUS_ORDER = ["new", "confirmed", "delivering", "done", "cancelled"];

  var state = {
    user: null,
    view: "dashboard",
    products: [],
    brands: [],
    orders: [],
    stats: null,
    orderFilter: "all",
  };

  var root = function () { return u.qs("#admin-root"); };

  /* ================================================================== */
  /*  Modal                                                             */
  /* ================================================================== */
  function adOpen(html) {
    u.qs("#ad-modal-content").innerHTML = html;
    u.qs("#ad-modal").setAttribute("aria-hidden", "false");
    u.qs("#ad-overlay").classList.add("is-visible");
  }
  function adClose() {
    u.qs("#ad-modal").setAttribute("aria-hidden", "true");
    u.qs("#ad-overlay").classList.remove("is-visible");
  }

  /* ================================================================== */
  /*  Нэвтрэлт хамгаалалт                                                */
  /* ================================================================== */
  async function ensureAdmin() {
    var me;
    try { me = await PM.api.get("/auth/me"); } catch (e) { me = { user: null }; }
    state.user = me.user;
    if (!state.user) return renderLogin("");
    if (state.user.role !== "admin") return renderNoAccess();
    await loadData();
    renderApp();
  }

  function renderLogin(errMsg) {
    root().innerHTML =
      '<div class="ad-gate">' +
        '<div class="ad-gate__card">' +
          '<h1 class="ad-gate__logo">' + esc(PM.CONFIG.brand.name) + '</h1>' +
          '<p class="ad-gate__sub">Админ самбарт нэвтрэх</p>' +
          (errMsg ? '<p class="auth__err">' + esc(errMsg) + "</p>" : "") +
          '<form id="ad-login">' +
            '<div class="field"><label>И-мэйл</label>' +
              '<input type="email" name="email" required placeholder="admin@decante.mn" /></div>' +
            '<div class="field"><label>Нууц үг</label>' +
              '<input type="password" name="password" required placeholder="••••••" /></div>' +
            '<button type="submit" class="btn btn--solid btn--block">Нэвтрэх</button>' +
          "</form>" +
          '<a class="ad-gate__back" href="/">← Дэлгүүр рүү буцах</a>' +
        "</div>" +
      "</div>";
    u.qs("#ad-login").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      var btn = f.querySelector("button");
      btn.disabled = true;
      try {
        await PM.api.post("/auth/login", { email: f.email.value.trim(), password: f.password.value });
        ensureAdmin();
      } catch (err) {
        renderLogin(err.message);
      }
    });
  }

  function renderNoAccess() {
    root().innerHTML =
      '<div class="ad-gate"><div class="ad-gate__card">' +
        '<h1 class="ad-gate__logo">Хандах эрхгүй</h1>' +
        '<p class="ad-gate__sub">Энэ хуудас зөвхөн админд зориулагдсан.</p>' +
        '<button class="btn btn--outline btn--block" data-ad="logout">Өөр эрхээр нэвтрэх</button>' +
        '<a class="ad-gate__back" href="/">← Дэлгүүр рүү буцах</a>' +
      "</div></div>";
  }

  /* ================================================================== */
  /*  Өгөгдөл ачаалах                                                    */
  /* ================================================================== */
  async function loadData() {
    var r = await Promise.all([
      PM.api.get("/products?all=1"),
      PM.api.get("/brands"),
      PM.api.get("/orders"),
      PM.api.get("/stats"),
    ]);
    state.products = r[0].products || [];
    state.brands = r[1].brands || [];
    state.orders = r[2].orders || [];
    state.stats = r[3];
  }
  function reloadProducts() { return PM.api.get("/products?all=1").then(function (r) { state.products = r.products; }); }
  function reloadBrands() { return PM.api.get("/brands").then(function (r) { state.brands = r.brands; }); }
  function reloadOrders() { return PM.api.get("/orders").then(function (r) { state.orders = r.orders; }); }
  function reloadStats() { return PM.api.get("/stats").then(function (r) { state.stats = r; }); }

  function getProduct(id) { return state.products.filter(function (p) { return p.id === id; })[0]; }
  function getOrder(id) { return state.orders.filter(function (o) { return o.id === id; })[0]; }

  /* ================================================================== */
  /*  Апп бүрхүүл                                                        */
  /* ================================================================== */
  function renderApp() {
    var nav = [
      { key: "dashboard", label: "Хянах самбар", icon: "▤" },
      { key: "products",  label: "Бүтээгдэхүүн", icon: "🧴" },
      { key: "brands",    label: "Брэнд",         icon: "✦" },
      { key: "orders",    label: "Захиалга",      icon: "🧾" },
    ].map(function (n) {
      return '<button type="button" class="ad-nav__item' + (state.view === n.key ? " is-active" : "") +
        '" data-view="' + n.key + '"><span class="ad-nav__ico">' + n.icon + "</span>" + esc(n.label) + "</button>";
    }).join("");

    root().innerHTML =
      '<header class="ad-topbar">' +
        '<div class="ad-brand"><span class="logo__mark"></span>' +
          '<span class="ad-brand__name">' + esc(PM.CONFIG.brand.name) + ' <em>Админ</em></span></div>' +
        '<div class="ad-topbar__right">' +
          '<a class="btn btn--text btn--sm" href="/" target="_blank" rel="noopener">Дэлгүүр ↗</a>' +
          '<span class="ad-user">' + esc(state.user.name) + "</span>" +
          '<button class="btn btn--outline btn--sm" data-ad="logout">Гарах</button>' +
        "</div>" +
      "</header>" +
      '<div class="ad-layout">' +
        '<aside class="ad-sidebar"><nav class="ad-nav">' + nav + "</nav></aside>" +
        '<main class="ad-main" id="ad-main"></main>' +
      "</div>";

    switchView(state.view);
  }

  function switchView(name) {
    state.view = name;
    u.qsa(".ad-nav__item").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-view") === name);
    });
    if (name === "dashboard") return renderDashboard();
    if (name === "products") return renderProducts();
    if (name === "brands") return renderBrands();
    if (name === "orders") return renderOrders();
  }

  function main() { return u.qs("#ad-main"); }
  function pageHead(title, sub, actions) {
    return '<div class="ad-page__head"><div><h1 class="ad-page__title">' + esc(title) + "</h1>" +
      (sub ? '<p class="ad-page__sub">' + esc(sub) + "</p>" : "") + "</div>" +
      (actions ? '<div class="ad-page__actions">' + actions + "</div>" : "") + "</div>";
  }

  /* ================================================================== */
  /*  Харагдац: Хянах самбар                                             */
  /* ================================================================== */
  function renderDashboard() {
    var s = state.stats || {};
    var cards = [
      { label: "Нийт захиалга", value: s.totalOrders || 0, hint: "Өнөөдөр: " + (s.todayOrders || 0) },
      { label: "Орлого", value: fmt(s.revenue || 0), hint: "Цуцлаагүй захиалгууд" },
      { label: "Идэвхтэй бараа", value: (s.activeProducts || 0) + " / " + (s.totalProducts || 0), hint: "Идэвхтэй / нийт" },
      { label: "Хэрэглэгч", value: s.totalCustomers || 0, hint: state.brands.length + " брэнд" },
    ].map(function (c) {
      return '<div class="ad-stat"><span class="ad-stat__label">' + esc(c.label) + "</span>" +
        '<span class="ad-stat__value">' + esc(String(c.value)) + "</span>" +
        '<span class="ad-stat__hint">' + esc(c.hint) + "</span></div>";
    }).join("");

    var byStatus = s.byStatus || {};
    var statusRow = STATUS_ORDER.map(function (k) {
      return '<div class="ad-sbadge"><span class="status ' + STATUS[k].cls + '">' + STATUS[k].label + "</span>" +
        '<b>' + (byStatus[k] || 0) + "</b></div>";
    }).join("");

    var recent = state.orders.slice(0, 6);
    var recentRows = recent.length
      ? recent.map(orderRowHTML).join("")
      : '<tr><td colspan="6" class="ad-empty">Захиалга алга байна.</td></tr>';

    main().innerHTML =
      pageHead("Хянах самбар", "Дэлгүүрийн ерөнхий байдал") +
      '<div class="ad-stats">' + cards + "</div>" +
      '<div class="ad-panel"><h2 class="ad-panel__title">Төлвөөр</h2><div class="ad-sbadges">' + statusRow + "</div></div>" +
      '<div class="ad-panel"><h2 class="ad-panel__title">Сүүлийн захиалга</h2>' +
        '<div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
          "<th>Код</th><th>Огноо</th><th>Захиалагч</th><th>Бараа</th><th>Дүн</th><th>Төлөв</th>" +
        "</tr></thead><tbody>" + recentRows + "</tbody></table></div></div>";
  }

  /* ================================================================== */
  /*  Харагдац: Бүтээгдэхүүн                                             */
  /* ================================================================== */
  function renderProducts() {
    var rows = state.products.map(function (p) {
      return '<tr>' +
        '<td><div class="ad-prod"><span class="ad-swatch" style="background:' + esc(p.accent || "#ccc") + '"></span>' +
          '<div><b>' + esc(p.name) + '</b><span class="ad-prod__brand">' + esc(p.brand) + " · " + genderLabel(p.gender) + "</span></div></div></td>" +
        "<td>" + fmt(p.prices[5]) + " / " + fmt(p.prices[10]) + " / " + fmt(p.prices[20]) + "</td>" +
        "<td>" + (p.popular ? '<span class="tag">Эрэлттэй</span>' : "") +
          (p.active === false ? '<span class="tag tag--off">Идэвхгүй</span>' : '<span class="tag tag--on">Идэвхтэй</span>') + "</td>" +
        '<td class="ad-actions">' +
          '<button class="btn btn--text btn--sm" data-ad="product-edit" data-id="' + p.id + '">Засах</button>' +
          '<button class="btn btn--text btn--sm ad-del" data-ad="product-delete" data-id="' + p.id + '">Устгах</button>' +
        "</td></tr>";
    }).join("");

    main().innerHTML =
      pageHead("Бүтээгдэхүүн", state.products.length + " бараа",
        '<button class="btn btn--solid btn--sm" data-ad="product-new">＋ Шинэ бараа</button>') +
      '<div class="ad-panel"><div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
        "<th>Нэр</th><th>Үнэ (5/10/20мл)</th><th>Төлөв</th><th></th>" +
      "</tr></thead><tbody>" +
        (rows || '<tr><td colspan="4" class="ad-empty">Бараа алга.</td></tr>') +
      "</tbody></table></div></div>";
  }

  function openProductForm(product) {
    var isEdit = !!product;
    var p = product || { name: "", brand: "", gender: "unisex", accent: "#8a6d3f", year: "",
      popular: false, active: true, description: "", prices: {}, notes: { top: [], heart: [], base: [] } };

    var brandOptions = state.brands.map(function (b) {
      return '<option value="' + esc(b.name) + '"></option>';
    }).join("");

    var priceInputs = SIZES.map(function (s) {
      return '<div class="field"><label>' + s + ' мл (₮)</label>' +
        '<input type="number" min="0" step="1000" name="price' + s + '" value="' + (p.prices[s] || "") + '" /></div>';
    }).join("");

    var html =
      '<div class="ad-form-wrap">' +
        '<h3 class="modal__title">' + (isEdit ? "Бараа засах" : "Шинэ бараа") + "</h3>" +
        '<p class="auth__err" hidden></p>' +
        '<form id="ad-product-form">' +
          '<div class="ad-grid2">' +
            '<div class="field"><label>Нэр *</label><input name="name" required value="' + esc(p.name) + '" /></div>' +
            '<div class="field"><label>Брэнд *</label><input name="brand" list="ad-brands" required value="' + esc(p.brand) + '" placeholder="Сонгох эсвэл шинээр бичих" />' +
              '<datalist id="ad-brands">' + brandOptions + "</datalist></div>" +
          "</div>" +
          '<div class="ad-grid2">' +
            '<div class="field"><label>Хүйс</label><select name="gender">' +
              opt("men", "Эрэгтэй", p.gender) + opt("women", "Эмэгтэй", p.gender) + opt("unisex", "Унисекс", p.gender) +
            "</select></div>" +
            '<div class="field"><label>Гарсан он</label><input type="number" name="year" value="' + esc(p.year || "") + '" /></div>' +
          "</div>" +
          '<div class="ad-grid3">' + priceInputs + "</div>" +
          '<div class="field"><label>Дээд нот (таслалаар)</label><input name="top" value="' + esc((p.notes.top || []).join(", ")) + '" /></div>' +
          '<div class="field"><label>Зүрхэн нот (таслалаар)</label><input name="heart" value="' + esc((p.notes.heart || []).join(", ")) + '" /></div>' +
          '<div class="field"><label>Суурь нот (таслалаар)</label><input name="base" value="' + esc((p.notes.base || []).join(", ")) + '" /></div>' +
          '<div class="field"><label>Тайлбар</label><textarea name="description" rows="2">' + esc(p.description || "") + "</textarea></div>" +
          '<div class="ad-grid2 ad-inline">' +
            '<div class="field"><label>Картны өнгө</label><input type="color" name="accent" value="' + esc(p.accent || "#8a6d3f") + '" /></div>' +
            '<div class="ad-checks">' +
              '<label class="ad-check"><input type="checkbox" name="popular"' + (p.popular ? " checked" : "") + " /> Эрэлттэй</label>" +
              '<label class="ad-check"><input type="checkbox" name="active"' + (p.active !== false ? " checked" : "") + " /> Идэвхтэй</label>" +
            "</div>" +
          "</div>" +
          '<div class="ad-form-foot">' +
            '<button type="button" class="btn btn--text" data-ad="close-modal">Болих</button>' +
            '<button type="submit" class="btn btn--solid">' + (isEdit ? "Хадгалах" : "Нэмэх") + "</button>" +
          "</div>" +
        "</form>" +
      "</div>";
    adOpen(html);

    u.qs("#ad-product-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      var errEl = u.qs("#ad-form-wrap .auth__err") || u.qs(".ad-form-wrap .auth__err");
      var payload = {
        name: f.name.value.trim(),
        brand: f.brand.value.trim(),
        gender: f.gender.value,
        year: f.year.value ? Number(f.year.value) : null,
        accent: f.accent.value,
        popular: f.popular.checked,
        active: f.active.checked,
        description: f.description.value.trim(),
        prices: { 5: Number(f.price5.value) || 0, 10: Number(f.price10.value) || 0, 20: Number(f.price20.value) || 0 },
        notes: {
          top: splitNotes(f.top.value), heart: splitNotes(f.heart.value), base: splitNotes(f.base.value),
        },
      };
      var btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (isEdit) await PM.api.patch("/products/" + product.id, payload);
        else await PM.api.post("/products", payload);
        await reloadProducts();
        adClose();
        u.toast(isEdit ? "Бараа шинэчлэгдлээ" : "Бараа нэмэгдлээ", "success");
        renderProducts();
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
        btn.disabled = false;
      }
    });
  }

  function confirmDeleteProduct(id) {
    var p = getProduct(id);
    if (!p) return;
    confirmModal("Бараа устгах уу?", "“" + p.brand + " " + p.name + "”-г бүрмөсөн устгана.", async function () {
      try {
        await PM.api.del("/products/" + id);
        await reloadProducts();
        adClose();
        u.toast("Устгагдлаа", "info");
        renderProducts();
      } catch (err) { u.toast(err.message, "error"); }
    });
  }

  /* ================================================================== */
  /*  Харагдац: Брэнд                                                    */
  /* ================================================================== */
  function renderBrands() {
    var rows = state.brands.map(function (b) {
      var count = state.products.filter(function (p) { return p.brandId === b.id || p.brand === b.name; }).length;
      return '<tr><td><b>' + esc(b.name) + "</b></td><td>" + count + " бараа</td>" +
        '<td class="ad-actions"><button class="btn btn--text btn--sm ad-del" data-ad="brand-delete" data-id="' + b.id + '">Устгах</button></td></tr>';
    }).join("");

    main().innerHTML =
      pageHead("Брэнд", state.brands.length + " брэнд") +
      '<div class="ad-panel ad-panel--pad">' +
        '<form id="ad-brand-form" class="ad-inline-form">' +
          '<input name="name" placeholder="Шинэ брэндийн нэр" required />' +
          '<button type="submit" class="btn btn--solid btn--sm">＋ Нэмэх</button>' +
        "</form>" +
      "</div>" +
      '<div class="ad-panel"><div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
        "<th>Нэр</th><th>Ашиглалт</th><th></th></tr></thead><tbody>" +
        (rows || '<tr><td colspan="3" class="ad-empty">Брэнд алга.</td></tr>') +
      "</tbody></table></div></div>";

    u.qs("#ad-brand-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = e.target.name.value.trim();
      if (!name) return;
      try {
        await PM.api.post("/brands", { name: name });
        await reloadBrands();
        u.toast("Брэнд нэмэгдлээ", "success");
        renderBrands();
      } catch (err) { u.toast(err.message, "error"); }
    });
  }

  function confirmDeleteBrand(id) {
    var b = state.brands.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    confirmModal("Брэнд устгах уу?", "“" + b.name + "”-г устгана.", async function () {
      try {
        await PM.api.del("/brands/" + id);
        await reloadBrands();
        adClose();
        u.toast("Устгагдлаа", "info");
        renderBrands();
      } catch (err) { adClose(); u.toast(err.message, "error"); }
    });
  }

  /* ================================================================== */
  /*  Харагдац: Захиалга                                                 */
  /* ================================================================== */
  function orderRowHTML(o) {
    var st = STATUS[o.status] || { label: o.status, cls: "" };
    return '<tr>' +
      '<td><b>' + esc(o.code) + "</b></td>" +
      "<td>" + esc(dateStr(o.createdAt)) + "</td>" +
      "<td>" + esc(o.customer.name) + '<br /><span class="ad-muted">' + esc(o.customer.phone) + "</span></td>" +
      "<td>" + o.items.reduce(function (n, it) { return n + it.qty; }, 0) + " ш</td>" +
      "<td><b>" + fmt(o.total) + "</b></td>" +
      '<td><span class="status ' + st.cls + '">' + esc(st.label) + "</span></td>" +
      "</tr>";
  }

  function renderOrders() {
    var filter = state.orderFilter;
    var list = filter === "all" ? state.orders : state.orders.filter(function (o) { return o.status === filter; });

    var chips = [{ key: "all", label: "Бүгд" }].concat(STATUS_ORDER.map(function (k) {
      return { key: k, label: STATUS[k].label };
    })).map(function (c) {
      return '<button class="filter-chip' + (filter === c.key ? " is-active" : "") + '" data-status="' + c.key + '">' + esc(c.label) + "</button>";
    }).join("");

    var rows = list.map(function (o) {
      var st = STATUS[o.status] || { label: o.status, cls: "" };
      return '<tr>' +
        '<td><b>' + esc(o.code) + "</b></td>" +
        "<td>" + esc(dateStr(o.createdAt)) + "</td>" +
        "<td>" + esc(o.customer.name) + '<br /><span class="ad-muted">' + esc(o.customer.phone) + "</span></td>" +
        "<td>" + o.items.reduce(function (n, it) { return n + it.qty; }, 0) + " ш</td>" +
        "<td><b>" + fmt(o.total) + "</b></td>" +
        '<td>' + statusSelect(o) + "</td>" +
        '<td class="ad-actions"><button class="btn btn--text btn--sm" data-ad="order-view" data-id="' + o.id + '">Дэлгэрэнгүй</button></td>' +
        "</tr>";
    }).join("");

    main().innerHTML =
      pageHead("Захиалга", state.orders.length + " захиалга") +
      '<div class="ad-panel ad-panel--pad"><div class="chips">' + chips + "</div></div>" +
      '<div class="ad-panel"><div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
        "<th>Код</th><th>Огноо</th><th>Захиалагч</th><th>Тоо</th><th>Дүн</th><th>Төлөв</th><th></th>" +
      "</tr></thead><tbody>" +
        (rows || '<tr><td colspan="7" class="ad-empty">Захиалга алга.</td></tr>') +
      "</tbody></table></div></div>";
  }

  function statusSelect(o) {
    var opts = STATUS_ORDER.map(function (k) {
      return '<option value="' + k + '"' + (o.status === k ? " selected" : "") + ">" + STATUS[k].label + "</option>";
    }).join("");
    return '<select class="ad-status-select ' + (STATUS[o.status] ? STATUS[o.status].cls : "") +
      '" data-order-status data-id="' + o.id + '">' + opts + "</select>";
  }

  async function changeOrderStatus(id, status) {
    try {
      await PM.api.patch("/orders/" + id, { status: status });
      await Promise.all([reloadOrders(), reloadStats()]);
      var o = getOrder(id);
      u.toast("Төлөв: " + (STATUS[status] ? STATUS[status].label : status), "success");
      // Select-ийн өнгийг шинэчлэх
      var sel = u.qs('[data-order-status][data-id="' + id + '"]');
      if (sel) sel.className = "ad-status-select " + (STATUS[status] ? STATUS[status].cls : "");
    } catch (err) { u.toast(err.message, "error"); }
  }

  function openOrderDetail(id) {
    var o = getOrder(id);
    if (!o) return;
    var items = o.items.map(function (it) {
      return "<tr><td>" + esc(it.brand + " " + it.name) + "</td><td>" + it.ml + " мл</td><td>" + it.qty +
        "</td><td>" + fmt(it.unitPrice) + "</td><td>" + fmt(it.lineTotal) + "</td></tr>";
    }).join("");

    var html =
      '<div class="ad-form-wrap">' +
        '<div class="ad-order-head"><h3 class="modal__title">Захиалга ' + esc(o.code) + "</h3>" +
          '<span class="status ' + (STATUS[o.status] ? STATUS[o.status].cls : "") + '">' +
            (STATUS[o.status] ? STATUS[o.status].label : o.status) + "</span></div>" +
        '<p class="ad-muted">' + esc(dateStr(o.createdAt)) + " · " + esc(o.userEmail || "") + "</p>" +
        '<div class="ad-tablewrap"><table class="ad-table ad-table--sm"><thead><tr>' +
          "<th>Бараа</th><th>Хэмжээ</th><th>Тоо</th><th>Нэгж</th><th>Дүн</th></tr></thead><tbody>" + items + "</tbody></table></div>" +
        '<div class="ad-sum">' +
          "<div><span>Барааны дүн</span><b>" + fmt(o.subtotal) + "</b></div>" +
          "<div><span>Хүргэлт</span><b>" + (o.deliveryFee === 0 ? "Үнэгүй" : fmt(o.deliveryFee)) + "</b></div>" +
          '<div class="ad-sum__total"><span>Нийт</span><b>' + fmt(o.total) + "</b></div>" +
        "</div>" +
        '<form id="ad-order-form">' +
          '<h4 class="ad-subhead">Захиалагчийн мэдээлэл</h4>' +
          '<div class="ad-grid2">' +
            '<div class="field"><label>Нэр</label><input name="name" value="' + esc(o.customer.name) + '" /></div>' +
            '<div class="field"><label>Утас</label><input name="phone" value="' + esc(o.customer.phone) + '" /></div>' +
          "</div>" +
          '<div class="field"><label>Хаяг</label><input name="address" value="' + esc(o.customer.address || "") + '" /></div>' +
          '<div class="field"><label>Тэмдэглэл</label><input name="note" value="' + esc(o.customer.note || "") + '" /></div>' +
          '<div class="field"><label>Төлөв</label><select name="status">' +
            STATUS_ORDER.map(function (k) { return '<option value="' + k + '"' + (o.status === k ? " selected" : "") + ">" + STATUS[k].label + "</option>"; }).join("") +
          "</select></div>" +
          '<div class="ad-form-foot">' +
            '<button type="button" class="btn btn--text" data-ad="close-modal">Хаах</button>' +
            '<button type="submit" class="btn btn--solid">Хадгалах</button>' +
          "</div>" +
        "</form>" +
      "</div>";
    adOpen(html);

    u.qs("#ad-order-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      try {
        await PM.api.patch("/orders/" + id, {
          status: f.status.value,
          customer: { name: f.name.value.trim(), phone: f.phone.value.trim(), address: f.address.value.trim(), note: f.note.value.trim() },
        });
        await Promise.all([reloadOrders(), reloadStats()]);
        adClose();
        u.toast("Захиалга шинэчлэгдлээ", "success");
        renderOrders();
      } catch (err) { u.toast(err.message, "error"); }
    });
  }

  /* ================================================================== */
  /*  Баталгаажуулах modal                                              */
  /* ================================================================== */
  function confirmModal(title, msg, onYes) {
    adOpen(
      '<div class="ad-confirm">' +
        "<h3>" + esc(title) + "</h3><p>" + esc(msg) + "</p>" +
        '<div class="ad-form-foot">' +
          '<button type="button" class="btn btn--text" data-ad="close-modal">Болих</button>' +
          '<button type="button" class="btn btn--solid ad-danger-btn" id="ad-confirm-yes">Тийм, устга</button>' +
        "</div>" +
      "</div>"
    );
    u.qs("#ad-confirm-yes").addEventListener("click", onYes);
  }

  /* ================================================================== */
  /*  Туслахууд                                                          */
  /* ================================================================== */
  function opt(val, label, cur) {
    return '<option value="' + val + '"' + (cur === val ? " selected" : "") + ">" + label + "</option>";
  }
  function genderLabel(g) { return g === "men" ? "Эрэгтэй" : g === "women" ? "Эмэгтэй" : "Унисекс"; }
  function splitNotes(str) {
    return (str || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function dateStr(ts) {
    var d = new Date(ts), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ================================================================== */
  /*  Дэлхийн event holbolt                                              */
  /* ================================================================== */
  document.addEventListener("click", function (e) {
    var viewBtn = e.target.closest("[data-view]");
    if (viewBtn) return switchView(viewBtn.getAttribute("data-view"));

    var el = e.target.closest("[data-ad]");
    if (!el) return;
    var act = el.getAttribute("data-ad");
    var id = el.getAttribute("data-id");
    switch (act) {
      case "close-modal": adClose(); break;
      case "logout":
        PM.api.post("/auth/logout").finally(function () { ensureAdmin(); });
        break;
      case "product-new": openProductForm(null); break;
      case "product-edit": openProductForm(getProduct(id)); break;
      case "product-delete": confirmDeleteProduct(id); break;
      case "brand-delete": confirmDeleteBrand(id); break;
      case "order-view": openOrderDetail(id); break;
    }
  });

  document.addEventListener("change", function (e) {
    var sel = e.target.closest("[data-order-status]");
    if (sel) changeOrderStatus(sel.getAttribute("data-id"), sel.value);
  });

  // Status filter chips (delegated)
  document.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip[data-status]");
    if (!chip) return;
    state.orderFilter = chip.getAttribute("data-status");
    renderOrders();
  });

  // Overlay дарахад modal хаах
  var ov = u.qs("#ad-overlay");
  if (ov) ov.addEventListener("click", adClose);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") adClose(); });

  /* Эхлүүлэх */
  ensureAdmin();
})();
