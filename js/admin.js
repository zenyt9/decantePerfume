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

  var SIZES = [5, 10, 20, 50, 100];
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
    users: [],
    reviews: [],
    stats: null,
    orderFilter: "all",
    search: { products: "", orders: "", customers: "" },
  };
  var VIEWS = ["dashboard", "products", "brands", "orders", "customers", "reviews"];

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
      PM.api.get("/users").catch(function () { return { users: [] }; }),
      PM.api.get("/reviews").catch(function () { return { reviews: [] }; }),
    ]);
    state.products = r[0].products || [];
    state.brands = r[1].brands || [];
    state.orders = r[2].orders || [];
    state.stats = r[3];
    state.users = r[4].users || [];
    state.reviews = r[5].reviews || [];
  }
  function reloadProducts() { return PM.api.get("/products?all=1").then(function (r) { state.products = r.products; }); }
  function reloadBrands() { return PM.api.get("/brands").then(function (r) { state.brands = r.brands; }); }
  function reloadOrders() { return PM.api.get("/orders").then(function (r) { state.orders = r.orders; }); }
  function reloadStats() { return PM.api.get("/stats").then(function (r) { state.stats = r; }); }
  function reloadUsers() { return PM.api.get("/users").then(function (r) { state.users = r.users; }); }
  function reloadReviews() { return PM.api.get("/reviews").then(function (r) { state.reviews = r.reviews; }); }

  function getProduct(id) { return state.products.filter(function (p) { return p.id === id; })[0]; }
  function getOrder(id) { return state.orders.filter(function (o) { return o.id === id; })[0]; }
  function getUser(id) { return state.users.filter(function (x) { return x.id === id; })[0]; }

  /* ================================================================== */
  /*  Апп бүрхүүл                                                        */
  /* ================================================================== */
  function renderApp() {
    var nav = [
      { key: "dashboard", label: "Хянах самбар", icon: "▤" },
      { key: "products",  label: "Бүтээгдэхүүн", icon: "🧴" },
      { key: "brands",    label: "Брэнд",         icon: "✦" },
      { key: "orders",    label: "Захиалга",      icon: "🧾" },
      { key: "customers", label: "Хэрэглэгч",     icon: "👤" },
      { key: "reviews",   label: "Сэтгэгдэл",     icon: "⭐" },
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

    // Анхны харагдацыг URL hash-аас (эсвэл dashboard) авна
    var initial = (location.hash || "").replace("#", "");
    if (VIEWS.indexOf(initial) === -1) initial = "dashboard";
    switchView(initial, false);
    try { history.replaceState({ adminView: initial }, "", "#" + initial); } catch (e) {}
  }

  function switchView(name, push) {
    state.view = name;
    u.qsa(".ad-nav__item").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-view") === name);
    });
    // Хөтчийн back товч админ дотор ажиллахын тулд history-д бичнэ
    if (push !== false) {
      try { history.pushState({ adminView: name }, "", "#" + name); } catch (e) {}
    }
    if (name === "dashboard") return renderDashboard();
    if (name === "products") return renderProducts();
    if (name === "brands") return renderBrands();
    if (name === "orders") return renderOrders();
    if (name === "customers") return renderCustomers();
    if (name === "reviews") return renderReviewsView();
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

    var quickNav =
      '<div class="ad-quicknav">' +
        '<button class="ad-qbtn ad-qbtn--solid" data-ad="product-new"><span class="ad-qbtn__ico">＋</span><b>Шинэ бараа нэмэх</b><em>Бүтээгдэхүүн оруулах</em></button>' +
        '<button class="ad-qbtn" data-view="products"><span class="ad-qbtn__ico">🧴</span><b>Бүтээгдэхүүн</b><em>Засах / устгах</em></button>' +
        '<button class="ad-qbtn" data-view="orders"><span class="ad-qbtn__ico">🧾</span><b>Захиалга</b><em>Хянах</em></button>' +
        '<button class="ad-qbtn" data-view="brands"><span class="ad-qbtn__ico">✦</span><b>Брэнд</b><em>Удирдах</em></button>' +
      "</div>";
    main().innerHTML =
      pageHead("Хянах самбар", "Дэлгүүрийн ерөнхий байдал",
        '<button class="btn btn--solid" data-ad="product-new">＋ Шинэ бараа нэмэх</button>') +
      quickNav +
      '<div class="ad-stats">' + cards + "</div>" +
      '<div class="ad-panel"><h2 class="ad-panel__title">Нөөцлөл (Backup)</h2>' +
        '<p class="ad-hint">' +
          'Бүх өгөгдлийг (захиалга, хэрэглэгч, бараа) нэг .json файлаар татаж, ' +
          'компьютер эсвэл Google Drive-даа хадгалаарай. Долоо хоног бүр татахыг зөвлөнө.</p>' +
        '<a class="btn btn--outline btn--sm" href="/api/admin/export" download>⬇ Backup татах (.json)</a></div>' +
      '<div class="ad-panel"><h2 class="ad-panel__title">Аюулгүй байдал</h2>' +
        '<p class="ad-hint">Админ нууц үгээ хэн ч мэдэхгүй, хүчтэй нууц үгээр тогтмол шинэчилж байхыг зөвлөнө.</p>' +
        '<button class="btn btn--outline btn--sm" data-ad="change-password">🔑 Нууц үг солих</button></div>' +
      '<div class="ad-panel"><h2 class="ad-panel__title">Төлвөөр</h2><div class="ad-sbadges">' + statusRow + "</div></div>" +
      '<div class="ad-panel"><h2 class="ad-panel__title">Сүүлийн захиалга</h2>' +
        '<div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
          "<th>Код</th><th>Огноо</th><th>Захиалагч</th><th>Бараа</th><th>Дүн</th><th>Төлөв</th>" +
        "</tr></thead><tbody>" + recentRows + "</tbody></table></div></div>";
  }

  /* ================================================================== */
  /*  Харагдац: Бүтээгдэхүүн                                             */
  /* ================================================================== */
  function productRow(p) {
    var tags = "";
    if (p.popular) tags += '<span class="tag">Эрэлттэй</span>';
    if (Number(p.discount) > 0) tags += '<span class="tag tag--sale">−' + Math.round(p.discount) + "%</span>";
    if (p.stock !== "" && p.stock !== null && p.stock !== undefined) {
      var n = Math.max(0, Math.round(Number(p.stock) || 0));
      tags += n <= 0 ? '<span class="tag tag--off">Дууссан</span>' : '<span class="tag">Нөөц: ' + n + "</span>";
    }
    tags += (p.active === false)
      ? '<span class="tag tag--off">Идэвхгүй</span>'
      : '<span class="tag tag--on">Идэвхтэй</span>';
    return "<tr>" +
      '<td><div class="ad-prod"><span class="ad-swatch" style="background:' + esc(p.accent || "#ccc") + '"></span>' +
        "<div><b>" + esc(p.name) + '</b><span class="ad-prod__brand">' + esc(p.brand) + " · " + genderLabel(p.gender) +
        (p.concentration ? " · " + esc(p.concentration) : "") + "</span></div></div></td>" +
      "<td>" + SIZES.map(function (s) { return fmt(p.prices[s]); }).join(" / ") + "</td>" +
      "<td>" + tags + "</td>" +
      '<td class="ad-actions">' +
        '<button class="btn btn--text btn--sm" data-ad="product-edit" data-id="' + p.id + '">Засах</button>' +
        '<button class="btn btn--text btn--sm ad-del" data-ad="product-delete" data-id="' + p.id + '">Устгах</button>' +
      "</td></tr>";
  }
  function fillProducts() {
    var q = (state.search.products || "").trim().toLowerCase();
    var list = state.products.filter(function (p) {
      return !q || (p.name + " " + p.brand).toLowerCase().indexOf(q) > -1;
    });
    var tb = u.qs("#ad-prod-body");
    if (tb) tb.innerHTML = list.length
      ? list.map(productRow).join("")
      : '<tr><td colspan="4" class="ad-empty">Бараа олдсонгүй.</td></tr>';
  }
  function renderProducts() {
    main().innerHTML =
      pageHead("Бүтээгдэхүүн", state.products.length + " бараа",
        searchBox("products", "Нэр, брэнд хайх…") +
        '<button class="btn btn--solid btn--sm" data-ad="product-new">＋ Шинэ бараа</button>') +
      '<div class="ad-panel"><div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
        "<th>Нэр</th><th>Үнэ 5/10/20/50/100мл (₮)</th><th>Төлөв</th><th></th>" +
      '</tr></thead><tbody id="ad-prod-body"></tbody></table></div></div>';
    fillProducts();
    onSearch("products", fillProducts);
  }

  function openProductForm(product) {
    var isEdit = !!product;
    var p = product || { name: "", brand: "", gender: "unisex", accent: "#8a6d3f", year: "",
      popular: false, active: true, description: "", image: "", concentration: "", discount: 0, stock: "",
      prices: {}, notes: { top: [], heart: [], base: [] } };

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
          '<div class="ad-grid2">' +
            '<div class="field"><label>Концентраци</label><select name="concentration">' +
              opt("", "— сонгох —", p.concentration) + opt("EDP", "EDP (Eau de Parfum)", p.concentration) +
              opt("EDT", "EDT (Eau de Toilette)", p.concentration) + opt("EDC", "EDC", p.concentration) +
              opt("Parfum", "Parfum", p.concentration) + opt("Extrait", "Extrait", p.concentration) +
            "</select></div>" +
            '<div class="field"><label>Хямдрал (%)</label><input type="number" name="discount" min="0" max="90" value="' + (p.discount || "") + '" placeholder="0" /></div>' +
          "</div>" +
          '<div class="ad-grid2">' +
            '<div class="field"><label>Зургийн холбоос (URL)</label><input name="image" value="' + esc(p.image || "") + '" placeholder="https://... (хоосон = флакон)" /></div>' +
            '<div class="field"><label>Нөөц (ширхэг)</label><input type="number" name="stock" min="0" value="' + (p.stock === "" || p.stock == null ? "" : p.stock) + '" placeholder="хоосон = хязгааргүй" /></div>' +
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
        image: f.image.value.trim(),
        concentration: f.concentration.value,
        discount: Number(f.discount.value) || 0,
        stock: f.stock.value.trim() === "" ? "" : Math.max(0, Number(f.stock.value) || 0),
        prices: SIZES.reduce(function (o, s) { o[s] = Number(f["price" + s].value) || 0; return o; }, {}),
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

  function orderRowFull(o) {
    return "<tr>" +
      "<td><b>" + esc(o.code) + "</b></td>" +
      "<td>" + esc(dateStr(o.createdAt)) + "</td>" +
      "<td>" + esc(o.customer.name) + '<br /><span class="ad-muted">' + esc(o.customer.phone) + "</span></td>" +
      "<td>" + o.items.reduce(function (n, it) { return n + it.qty; }, 0) + " ш</td>" +
      "<td><b>" + fmt(o.total) + "</b></td>" +
      "<td>" + statusSelect(o) + "</td>" +
      '<td class="ad-actions"><button class="btn btn--text btn--sm" data-ad="order-view" data-id="' + o.id + '">Дэлгэрэнгүй</button></td>' +
      "</tr>";
  }
  function fillOrders() {
    var filter = state.orderFilter;
    var q = (state.search.orders || "").trim().toLowerCase();
    var list = state.orders.filter(function (o) {
      if (filter !== "all" && o.status !== filter) return false;
      return !q || (o.code + " " + o.customer.name + " " + o.customer.phone).toLowerCase().indexOf(q) > -1;
    });
    var tb = u.qs("#ad-order-body");
    if (tb) tb.innerHTML = list.length
      ? list.map(orderRowFull).join("")
      : '<tr><td colspan="7" class="ad-empty">Захиалга олдсонгүй.</td></tr>';
  }
  function renderOrders() {
    var filter = state.orderFilter;
    var chips = [{ key: "all", label: "Бүгд" }].concat(STATUS_ORDER.map(function (k) {
      return { key: k, label: STATUS[k].label };
    })).map(function (c) {
      return '<button class="filter-chip' + (filter === c.key ? " is-active" : "") + '" data-status="' + c.key + '">' + esc(c.label) + "</button>";
    }).join("");

    main().innerHTML =
      pageHead("Захиалга", state.orders.length + " захиалга", searchBox("orders", "Код, нэр, утас хайх…")) +
      '<div class="ad-panel ad-panel--pad"><div class="chips">' + chips + "</div></div>" +
      '<div class="ad-panel"><div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
        "<th>Код</th><th>Огноо</th><th>Захиалагч</th><th>Тоо</th><th>Дүн</th><th>Төлөв</th><th></th>" +
      '</tr></thead><tbody id="ad-order-body"></tbody></table></div></div>';
    fillOrders();
    onSearch("orders", fillOrders);
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
  /*  Хайлтын туслахууд                                                 */
  /* ================================================================== */
  function searchBox(key, placeholder) {
    return '<input type="search" class="ad-search" id="ad-search-' + key + '" ' +
      'placeholder="' + esc(placeholder) + '" value="' + esc(state.search[key] || "") + '" />';
  }
  function onSearch(key, fill) {
    var el = u.qs("#ad-search-" + key);
    if (el) el.addEventListener("input", function () { state.search[key] = el.value; fill(); });
  }

  /* ================================================================== */
  /*  Харагдац: Хэрэглэгч                                                */
  /* ================================================================== */
  function customerRow(c) {
    var badge = c.emailVerified
      ? '<span class="tag tag--on">Баталгаажсан</span>'
      : '<span class="tag tag--off">Батлаагүй</span>';
    return '<tr class="ad-clickable" data-ad="customer-view" data-id="' + c.id + '">' +
      "<td><b>" + esc(c.name) + "</b> " + badge + "</td>" +
      "<td>" + esc(c.email) + '<br><span class="ad-muted">' + esc(c.phone || "—") + "</span></td>" +
      "<td>" + c.orderCount + " ш</td>" +
      "<td><b>" + fmt(c.totalSpent) + "</b></td>" +
      "<td>" + esc(dateStr(c.createdAt)) + "</td></tr>";
  }
  function fillCustomers() {
    var q = (state.search.customers || "").trim().toLowerCase();
    var list = state.users.filter(function (c) {
      return !q || (c.name + " " + c.email + " " + (c.phone || "")).toLowerCase().indexOf(q) > -1;
    });
    var tb = u.qs("#ad-cust-body");
    if (tb) tb.innerHTML = list.length
      ? list.map(customerRow).join("")
      : '<tr><td colspan="5" class="ad-empty">Хэрэглэгч олдсонгүй.</td></tr>';
  }
  function renderCustomers() {
    main().innerHTML =
      pageHead("Хэрэглэгч", state.users.length + " бүртгэлтэй үйлчлүүлэгч", searchBox("customers", "Нэр, и-мэйл, утас хайх…")) +
      '<div class="ad-panel"><div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
        "<th>Нэр</th><th>Холбоо барих</th><th>Захиалга</th><th>Нийт зарцуулсан</th><th>Бүртгүүлсэн</th>" +
      '</tr></thead><tbody id="ad-cust-body"></tbody></table></div></div>';
    fillCustomers();
    onSearch("customers", fillCustomers);
  }
  function openCustomerDetail(id) {
    var c = getUser(id);
    if (!c) return;
    var orders = state.orders.filter(function (o) { return o.userId === id; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
    var orderRows = orders.length ? orders.map(function (o) {
      var st = STATUS[o.status] || { label: o.status, cls: "" };
      return "<tr><td><b>" + esc(o.code) + "</b></td><td>" + esc(dateStr(o.createdAt)) + "</td>" +
        "<td>" + o.items.reduce(function (n, it) { return n + it.qty; }, 0) + " ш</td>" +
        "<td><b>" + fmt(o.total) + "</b></td>" +
        '<td><span class="status ' + st.cls + '">' + esc(st.label) + "</span></td></tr>";
    }).join("") : '<tr><td colspan="5" class="ad-empty">Захиалга алга.</td></tr>';
    adOpen(
      '<div class="ad-form-wrap">' +
        '<h3 class="modal__title">' + esc(c.name) + "</h3>" +
        '<p class="ad-muted">' + esc(c.email) + " · " + esc(c.phone || "утасгүй") +
          " · Бүртгүүлсэн " + esc(dateStr(c.createdAt)) + "</p>" +
        '<div class="ad-sum">' +
          "<div><span>Захиалгын тоо</span><b>" + c.orderCount + "</b></div>" +
          "<div><span>Нийт зарцуулсан</span><b>" + fmt(c.totalSpent) + "</b></div>" +
          "<div><span>И-мэйл баталгаажсан</span><b>" + (c.emailVerified ? "Тийм" : "Үгүй") + "</b></div>" +
        "</div>" +
        '<h4 class="ad-subhead">Захиалгын түүх</h4>' +
        '<div class="ad-tablewrap"><table class="ad-table ad-table--sm"><thead><tr>' +
          "<th>Код</th><th>Огноо</th><th>Тоо</th><th>Дүн</th><th>Төлөв</th></tr></thead><tbody>" +
          orderRows + "</tbody></table></div>" +
        '<div class="ad-form-foot"><button type="button" class="btn btn--text" data-ad="close-modal">Хаах</button></div>' +
      "</div>"
    );
  }

  /* ================================================================== */
  /*  Харагдац: Сэтгэгдэл                                                */
  /* ================================================================== */
  function reviewRow(r) {
    return '<div class="ad-review">' +
      '<div class="ad-review__body"><p>' + esc(r.text) + "</p>" +
        '<span class="ad-review__author">— ' + esc(r.author) + " · " + esc(dateStr(r.createdAt)) + "</span></div>" +
      '<button class="btn btn--text btn--sm ad-del" data-ad="review-delete" data-id="' + r.id + '">Устгах</button>' +
    "</div>";
  }
  function fillReviews() {
    var box = u.qs("#ad-reviews-list");
    if (box) box.innerHTML = state.reviews.length
      ? state.reviews.map(reviewRow).join("")
      : '<p class="ad-empty">Сэтгэгдэл алга. Дээрээс шинэ сэтгэгдэл нэмнэ үү.</p>';
  }
  function renderReviewsView() {
    main().innerHTML =
      pageHead("Сэтгэгдэл", state.reviews.length + " сэтгэгдэл нүүрэнд харагдаж байна") +
      '<div class="ad-panel ad-panel--pad">' +
        '<form id="ad-review-form" class="ad-review-form">' +
          '<textarea name="text" rows="2" placeholder="Сэтгэгдлийн текст…" required></textarea>' +
          '<div class="ad-review-form__foot">' +
            '<input name="author" placeholder="Нэр (ж: Болд, Улаанбаатар)" />' +
            '<button type="submit" class="btn btn--solid btn--sm">＋ Нэмэх</button>' +
          "</div>" +
        "</form>" +
      "</div>" +
      '<div class="ad-panel ad-panel--pad"><div id="ad-reviews-list"></div></div>';
    fillReviews();
    u.qs("#ad-review-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      var text = f.text.value.trim();
      if (!text) return;
      try {
        await PM.api.post("/reviews", { text: text, author: f.author.value.trim() });
        await reloadReviews();
        u.toast("Сэтгэгдэл нэмэгдлээ", "success");
        renderReviewsView();
      } catch (err) { u.toast(err.message, "error"); }
    });
  }
  function confirmDeleteReview(id) {
    confirmModal("Сэтгэгдэл устгах уу?", "Энэ сэтгэгдлийг нүүр хуудаснаас бүрмөсөн устгана.", async function () {
      try {
        await PM.api.del("/reviews/" + id);
        await reloadReviews();
        adClose();
        u.toast("Устгагдлаа", "info");
        renderReviewsView();
      } catch (err) { adClose(); u.toast(err.message, "error"); }
    });
  }

  /* ================================================================== */
  /*  Нууц үг солих                                                      */
  /* ================================================================== */
  function openPasswordChange() {
    adOpen(
      '<div class="ad-form-wrap">' +
        '<h3 class="modal__title">Нууц үг солих</h3>' +
        '<p class="auth__err" hidden></p>' +
        '<form id="ad-pw-form">' +
          '<div class="field"><label>Одоогийн нууц үг</label><input type="password" name="current" autocomplete="current-password" required /></div>' +
          '<div class="field"><label>Шинэ нууц үг (дор хаяж 6 тэмдэгт)</label><input type="password" name="pw1" autocomplete="new-password" minlength="6" required /></div>' +
          '<div class="field"><label>Шинэ нууц үг давтах</label><input type="password" name="pw2" autocomplete="new-password" minlength="6" required /></div>' +
          '<div class="ad-form-foot">' +
            '<button type="button" class="btn btn--text" data-ad="close-modal">Болих</button>' +
            '<button type="submit" class="btn btn--solid">Хадгалах</button>' +
          "</div>" +
        "</form>" +
      "</div>"
    );
    var errEl = u.qs(".ad-form-wrap .auth__err");
    var showErr = function (msg) { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
    u.qs("#ad-pw-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      if (f.pw1.value !== f.pw2.value) return showErr("Шинэ нууц үг таарахгүй байна.");
      if (f.pw1.value.length < 6) return showErr("Нууц үг дор хаяж 6 тэмдэгт байх ёстой.");
      var btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await PM.api.patch("/auth/me", { currentPassword: f.current.value, newPassword: f.pw1.value });
        adClose();
        u.toast("Нууц үг амжилттай шинэчлэгдлээ", "success");
      } catch (err) {
        showErr(err.message);
        btn.disabled = false;
      }
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
      case "customer-view": openCustomerDetail(id); break;
      case "review-delete": confirmDeleteReview(id); break;
      case "change-password": openPasswordChange(); break;
    }
  });

  // Хөтчийн back/forward — админ доторх харагдацуудаар шилжинэ (дэлгүүр рүү үсрэхгүй)
  window.addEventListener("popstate", function (e) {
    if (!u.qs(".ad-nav")) return; // зөвхөн админ shell байгаа үед
    var v = (e.state && e.state.adminView) || "dashboard";
    if (VIEWS.indexOf(v) === -1) v = "dashboard";
    switchView(v, false);
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
