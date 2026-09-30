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

  /* Захиалгын төлөв — урсгалын дарааллаар:
     Шинэ → Баглаж байна → Багласан → Хүргэлтэд гарсан → Хүргэгдсэн (эсвэл Цуцлагдсан).
     Төлбөр ормогц сервер "packing" болгоно; үлдсэнийг админ гараар ахиулна. */
  var STATUS = {
    new:        { label: "Шинэ",             cls: "st-new" },
    packing:    { label: "Баглаж байна",     cls: "st-packing" },
    packed:     { label: "Багласан",         cls: "st-packed" },
    delivering: { label: "Хүргэлтэд гарсан", cls: "st-delivering" },
    done:       { label: "Хүргэгдсэн",       cls: "st-done" },
    cancelled:  { label: "Цуцлагдсан",       cls: "st-cancelled" },
  };
  var STATUS_ORDER = ["new", "packing", "packed", "delivering", "done", "cancelled"];
  var FLOW = ["new", "packing", "packed", "delivering", "done"];

  /* Дараагийн алхам — мөр бүрт нэг товчоор төлвийг ахиулна */
  var NEXT_STEP = {
    packing:    { to: "packed",     label: "Баглаж дууссан" },
    packed:     { to: "delivering", label: "Хүргэлтэд гаргах" },
    delivering: { to: "done",       label: "Хүргэгдсэн" },
  };

  /* Захиалгын шүүлтүүр (chip). "new" chip зөвхөн гараар төлөх шинэ захиалга байвал гарна. */
  var ORDER_FILTERS = [
    { key: "todo",       label: "Хийх ажил",            count: true },
    { key: "packing",    label: "Баглаж байна",         count: true },
    { key: "packed",     label: "Багласан",             count: true },
    { key: "delivering", label: "Хүргэлтэд",            count: true },
    { key: "awaiting",   label: "Төлбөр хүлээгдэж буй", count: true },
    { key: "new",        label: "Шинэ",                 count: true, hideEmpty: true },
    { key: "done",       label: "Хүргэгдсэн" },
    { key: "cancelled",  label: "Цуцлагдсан" },
    { key: "all",        label: "Бүгд" },
  ];
  var FILTER_KEYS = ORDER_FILTERS.map(function (f) { return f.key; });

  var state = {
    user: null,
    view: "dashboard",
    products: [],
    brands: [],
    orders: [],
    users: [],
    reviews: [],
    stats: null,
    orderFilter: "todo",
    search: { products: "", orders: "", customers: "" },
  };
  var lastSync = 0; // захиалгыг серверээс хамгийн сүүлд татсан мөч
  var VIEWS = ["dashboard", "products", "brands", "orders", "customers", "reviews"];

  var root = function () { return u.qs("#admin-root"); };

  /* ================================================================== */
  /*  Modal                                                             */
  /* ================================================================== */
  function adOpen(html) {
    var m = u.qs("#ad-modal");
    u.qs("#ad-modal-content").innerHTML = html;
    // Шинэ цонх үргэлж дээрээсээ (өмнөх цонхны гүйлгэсэн байрлал үлдэхгүй)
    m.scrollTop = 0;
    m.setAttribute("aria-hidden", "false");
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
          '<img class="ad-gate__mark" src="assets/logo-mark.svg" alt="" width="31" height="60" />' +
          '<h1 class="ad-gate__logo ad-gate__logo--brand">' + esc(PM.CONFIG.brand.name) + '</h1>' +
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
        '<p class="ad-gate__sub">Энэ хуудсыг зөвхөн дэлгүүрийн админ ашиглана.</p>' +
        '<button class="btn btn--outline btn--block" data-ad="logout">Өөр бүртгэлээр нэвтрэх</button>' +
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
    lastSync = Date.now();
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
      // Захиалга хамгийн их ашиглагдах тул хоёрдугаарт (утсан дээр шууд харагдана)
      { key: "dashboard", label: "Хянах самбар", icon: "▤" },
      { key: "orders",    label: "Захиалга",      icon: "🧾" },
      { key: "products",  label: "Бүтээгдэхүүн", icon: "🧴" },
      { key: "brands",    label: "Брэнд",         icon: "✦" },
      { key: "customers", label: "Хэрэглэгч",     icon: "👤" },
      { key: "reviews",   label: "Сэтгэгдэл",     icon: "⭐" },
    ].map(function (n) {
      // "Захиалга" цэсэнд хийх ажлын тоог алтан бөмбөлгөөр харуулна
      var badge = n.key === "orders"
        ? '<span class="ad-nav__badge" id="ad-nav-todo" title="Хийх ажил" hidden></span>' : "";
      return '<button type="button" class="ad-nav__item' + (state.view === n.key ? " is-active" : "") +
        '" data-view="' + n.key + '"><span class="ad-nav__ico">' + n.icon + "</span>" + esc(n.label) + badge + "</button>";
    }).join("");

    root().innerHTML =
      '<header class="ad-topbar">' +
        '<div class="ad-brand"><img class="ad-brand__mark" src="assets/logo-mark.svg" alt="" width="18" height="34" />' +
          '<span class="ad-brand__name">' + esc(PM.CONFIG.brand.name) + ' <em>Админ</em></span></div>' +
        '<div class="ad-topbar__right">' +
          '<a class="btn btn--text btn--sm" href="/" target="_blank" rel="noopener" title="Дэлгүүрийг нээх" aria-label="Дэлгүүрийг шинэ цонхонд нээх">' +
            '<span class="ad-shop-txt">Дэлгүүр </span>↗</a>' +
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
    updateNavBadge();
    switchView(initial, false);
    try { history.replaceState({ adminView: initial, orderFilter: state.orderFilter }, "", "#" + initial); } catch (e) {}
  }

  function switchView(name, push) {
    state.view = name;
    u.qsa(".ad-nav__item").forEach(function (b) {
      var on = b.getAttribute("data-view") === name;
      b.classList.toggle("is-active", on);
      // Утсан дээр хэвтээ гүйдэг цэсэнд идэвхтэй хэсгийг харагдуулна
      if (on) scrollIntoRow(u.qs(".ad-nav"), b);
    });
    // Хөтчийн back товч админ дотор ажиллахын тулд history-д бичнэ
    // (захиалгын шүүлтүүрийг мөн хадгална — буцахад ижил жагсаалт гарна)
    if (push !== false) {
      try { history.pushState({ adminView: name, orderFilter: state.orderFilter }, "", "#" + name); } catch (e) {}
    }
    window.scrollTo(0, 0);
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
      { label: "Орлого", value: fmt(s.revenue || 0), hint: "Төлөгдсөн, цуцлагдаагүй захиалга" },
      { label: "Идэвхтэй бараа", value: (s.activeProducts || 0) + " / " + (s.totalProducts || 0), hint: "Идэвхтэй / нийт" },
      { label: "Хэрэглэгч", value: s.totalCustomers || 0, hint: state.brands.length + " брэнд" },
    ].map(function (c) {
      return '<div class="ad-stat"><span class="ad-stat__label">' + esc(c.label) + "</span>" +
        '<span class="ad-stat__value">' + esc(String(c.value)) + "</span>" +
        '<span class="ad-stat__hint">' + esc(c.hint) + "</span></div>";
    }).join("");

    // Төлөв тус бүрийн тоо (хуучин "confirmed"-ийг "Баглаж байна"-д тооцно).
    // Товч бүр тухайн шүүлтүүрийн жагсаалт руу аваачна — тоо нь нээгдэх жагсаалттай яг таарна.
    // "Шинэ"-г QPay төлбөр хүлээгдэж буй ба бусад (гараар төлөх) гэж салгаж харуулна.
    var statusRow = ["awaiting"].concat(STATUS_ORDER).map(function (k) {
      var n = countOrders(k);
      if (k === "new" && !n) return "";
      var st = k === "awaiting" ? { label: "Төлбөр хүлээгдэж буй", cls: STATUS.new.cls } : STATUS[k];
      return '<button type="button" class="ad-sbadge" data-ad="goto-orders" data-filter="' + k + '">' +
        '<span class="status ' + st.cls + '">' + esc(st.label) + "</span>" +
        "<b>" + n + "</b></button>";
    }).join("");

    var recent = state.orders.slice(0, 6);
    var recentRows = recent.length
      ? recent.map(orderRow).join("")
      : '<tr><td colspan="6" class="ad-empty">Одоогоор захиалга ирээгүй байна.</td></tr>';

    var quickNav =
      '<div class="ad-quicknav">' +
        '<button class="ad-qbtn ad-qbtn--solid" data-ad="product-new"><span class="ad-qbtn__ico">＋</span><b>Шинэ бараа нэмэх</b><em>Дэлгүүрт шинээр оруулах</em></button>' +
        '<button class="ad-qbtn" data-view="products"><span class="ad-qbtn__ico">🧴</span><b>Бүтээгдэхүүн</b><em>Засах, устгах</em></button>' +
        '<button class="ad-qbtn" data-view="orders"><span class="ad-qbtn__ico">🧾</span><b>Захиалга</b><em>Шалгах, төлөв солих</em></button>' +
        '<button class="ad-qbtn" data-view="brands"><span class="ad-qbtn__ico">✦</span><b>Брэнд</b><em>Нэмэх, устгах</em></button>' +
      "</div>";
    main().innerHTML =
      pageHead("Хянах самбар", "Дэлгүүрийн ерөнхий байдал",
        '<button class="btn btn--solid" data-ad="product-new">＋ Шинэ бараа нэмэх</button>') +
      todoPanelHTML() +
      quickNav +
      '<div class="ad-stats">' + cards + "</div>" +
      '<div class="ad-panel ad-panel--orders"><div class="ad-panel__bar"><h2 class="ad-panel__title">Сүүлийн захиалгууд</h2>' +
        '<button type="button" class="btn btn--text btn--sm" data-ad="goto-orders" data-filter="all">Бүгдийг харах →</button></div>' +
        '<div class="ad-tablewrap"><table class="ad-table ad-otable">' + orderThead() +
        "<tbody>" + recentRows + "</tbody></table></div></div>" +
      '<div class="ad-panel"><h2 class="ad-panel__title">Захиалга төлвөөр</h2><div class="ad-sbadges">' + statusRow + "</div></div>" +
      '<div class="ad-panel"><h2 class="ad-panel__title">Нөөц хуулбар (backup)</h2><div class="ad-panel__body">' +
        '<p class="ad-hint">' +
          'Захиалга, хэрэглэгч, барааны бүх мэдээллийг нэг .json файлаар татаж аваад ' +
          'компьютер эсвэл Google Drive-даа хадгалаарай. Долоо хоногт нэг удаа татаж байвал сэтгэл амар.</p>' +
        '<a class="btn btn--outline btn--sm" href="/api/admin/export" download>⬇ Нөөц хуулбар татах (.json)</a></div></div>' +
      '<div class="ad-panel"><h2 class="ad-panel__title">Аюулгүй байдал</h2><div class="ad-panel__body">' +
        '<p class="ad-hint">Админы нууц үгээ хэнд ч бүү хэлээрэй. Хүчтэй нууц үг сонгож, үе үе сольж байхыг зөвлөе.</p>' +
        '<button class="btn btn--outline btn--sm" data-ad="change-password">Нууц үг солих</button></div></div>';
  }

  /* "Өнөөдөр хийх ажил" — хамгийн чухал гурван том товч + төлбөр хүлээгдэж буй */
  function todoPanelHTML() {
    var tiles = [
      { f: "packing",    ico: "📦", label: "Баглах",           hint: "Төлбөр нь орсон, баглахыг хүлээж буй" },
      { f: "packed",     ico: "🚚", label: "Хүргэлтэд гаргах", hint: "Баглаж дууссан, хүргэлтэд гаргахад бэлэн" },
      { f: "delivering", ico: "🛵", label: "Хүргэлтэд яваа",   hint: "Хүргэлтийн ажилтан хүлээлгэн өгмөгц «Хүргэгдсэн» болгоорой" },
    ];
    var total = 0;
    var tilesHtml = tiles.map(function (t) {
      var n = countOrders(t.f);
      total += n;
      return '<button type="button" class="ad-tile ad-tile--' + t.f + (n ? " is-hot" : " is-zero") +
        '" data-ad="goto-orders" data-filter="' + t.f + '" aria-label="' + esc(t.label + ": " + n + " захиалга") + '">' +
        '<span class="ad-tile__ico" aria-hidden="true">' + t.ico + "</span>" +
        '<span class="ad-tile__n">' + n + "</span>" +
        '<span class="ad-tile__txt"><b>' + esc(t.label) + "</b><em>" + esc(t.hint) + "</em></span>" +
      "</button>";
    }).join("");
    var waiting = countOrders("awaiting");
    return '<section class="ad-todo" aria-label="Өнөөдөр хийх ажил">' +
      '<div class="ad-todo__head"><div>' +
        '<h2 class="ad-todo__title">Өнөөдөр хийх ажил</h2>' +
        '<p class="ad-todo__sub">' + (total
          ? "Товч дээр дарж тухайн захиалгуудаа нээгээрэй."
          : "Одоогоор хийх ажил алга. Төлбөр нь орсон захиалга энд автоматаар нэмэгдэнэ.") + "</p>" +
      "</div>" + refreshBtn() + "</div>" +
      '<div class="ad-todo__grid">' + tilesHtml + "</div>" +
      '<button type="button" class="ad-tile-mini" data-ad="goto-orders" data-filter="awaiting">' +
        '<span aria-hidden="true">⏳</span><span>Төлбөр хүлээгдэж буй <b>' + waiting + "</b></span>" +
        "<em>Захиалагч төлбөрөө төлмөгц «Баглах» руу автоматаар шилжинэ</em>" +
      "</button>" +
    "</section>";
  }
  function refreshBtn() {
    return '<button type="button" class="btn btn--outline btn--sm ad-refresh" data-ad="orders-refresh" title="Шинэ захиалга ирсэн эсэхийг шалгах">↻ Шинэчлэх</button>';
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
      tags += n <= 0 ? '<span class="tag tag--off">Нөөц дууссан</span>' : '<span class="tag">Нөөц: ' + n + "</span>";
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
        searchBox("products", "Нэр эсвэл брэндээр хайх…") +
        '<button class="btn btn--solid btn--sm" data-ad="product-new">＋ Шинэ бараа</button>') +
      '<div class="ad-panel"><div class="ad-tablewrap"><table class="ad-table"><thead><tr>' +
        "<th>Нэр</th><th>Үнэ 5/10/20/50/100 мл (₮)</th><th>Төлөв</th><th></th>" +
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
        '<h3 class="modal__title">' + (isEdit ? "Бараа засах" : "Шинэ бараа нэмэх") + "</h3>" +
        '<p class="auth__err" hidden></p>' +
        '<form id="ad-product-form">' +
          '<div class="ad-grid2">' +
            '<div class="field"><label>Нэр *</label><input name="name" required value="' + esc(p.name) + '" /></div>' +
            '<div class="field"><label>Брэнд *</label><input name="brand" list="ad-brands" required value="' + esc(p.brand) + '" placeholder="Жагсаалтаас сонгох эсвэл шинээр бичих" />' +
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
            '<div class="field"><label>Зургийн холбоос (URL)</label><input name="image" value="' + esc(p.image || "") + '" placeholder="https://… (хоосон бол флакон дүрс)" /></div>' +
            '<div class="field"><label>Нөөц (ширхэг)</label><input type="number" name="stock" min="0" value="' + (p.stock === "" || p.stock == null ? "" : p.stock) + '" placeholder="Хоосон бол хязгааргүй" /></div>' +
          "</div>" +
          '<div class="ad-grid3">' + priceInputs + "</div>" +
          '<div class="field"><label>Дээд нот (таслалаар салгана)</label><input name="top" value="' + esc((p.notes.top || []).join(", ")) + '" /></div>' +
          '<div class="field"><label>Зүрхэн нот (таслалаар салгана)</label><input name="heart" value="' + esc((p.notes.heart || []).join(", ")) + '" /></div>' +
          '<div class="field"><label>Суурь нот (таслалаар салгана)</label><input name="base" value="' + esc((p.notes.base || []).join(", ")) + '" /></div>' +
          '<div class="field"><label>Тайлбар</label><textarea name="description" rows="2">' + esc(p.description || "") + "</textarea></div>" +
          '<div class="ad-grid2 ad-inline">' +
            '<div class="field"><label>Картын өнгө</label><input type="color" name="accent" value="' + esc(p.accent || "#8a6d3f") + '" /></div>' +
            '<div class="ad-checks">' +
              '<label class="ad-check"><input type="checkbox" name="popular"' + (p.popular ? " checked" : "") + " /> Эрэлттэй</label>" +
              '<label class="ad-check"><input type="checkbox" name="active"' + (p.active !== false ? " checked" : "") + " /> Идэвхтэй (дэлгүүрт харагдана)</label>" +
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
        u.toast(isEdit ? "Өөрчлөлт хадгалагдлаа" : "Шинэ бараа нэмэгдлээ", "success");
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
    confirmModal("Бараа устгах уу?", "“" + p.brand + " " + p.name + "” барааг бүрмөсөн устгана. Дараа нь сэргээх боломжгүй.", async function () {
      try {
        await PM.api.del("/products/" + id);
        await reloadProducts();
        adClose();
        u.toast("Бараа устгагдлаа", "info");
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
        "<th>Нэр</th><th>Барааны тоо</th><th></th></tr></thead><tbody>" +
        (rows || '<tr><td colspan="3" class="ad-empty">Одоогоор брэнд нэмээгүй байна.</td></tr>') +
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
    confirmModal("Брэнд устгах уу?", "“" + b.name + "” брэндийг жагсаалтаас устгана.", async function () {
      try {
        await PM.api.del("/brands/" + id);
        await reloadBrands();
        adClose();
        u.toast("Брэнд устгагдлаа", "info");
        renderBrands();
      } catch (err) { adClose(); u.toast(err.message, "error"); }
    });
  }

  /* ================================================================== */
  /*  Харагдац: Захиалга                                                 */
  /* ================================================================== */
  /* Хуучин өгөгдлийн "confirmed" төлвийг "Баглаж байна" гэж үзнэ */
  function orderStatus(o) { return o.status === "confirmed" ? "packing" : o.status; }

  /* QPay захиалга, төлбөр нь хараахан ороогүй (Шинэ төлөвтэй) */
  function awaitingPayment(o) {
    var p = o.payment;
    return orderStatus(o) === "new" && !!p && p.method === "qpay" && p.status !== "paid";
  }

  function matchFilter(o, f) {
    var s = orderStatus(o);
    if (f === "all") return true;
    if (f === "todo") return s === "packing" || s === "packed" || s === "delivering";
    if (f === "awaiting") return awaitingPayment(o);
    if (f === "new") return s === "new" && !awaitingPayment(o);
    return s === f;
  }
  function countOrders(f) {
    return state.orders.filter(function (o) { return matchFilter(o, f); }).length;
  }
  function itemCount(o) {
    return (o.items || []).reduce(function (n, it) { return n + it.qty; }, 0);
  }

  function statusBadge(o) {
    var s = orderStatus(o);
    var st = STATUS[s] || { label: s, cls: "" };
    return '<span class="status ' + st.cls + '">' + esc(st.label) + "</span>";
  }

  /* Утасны дугаар — дарахад шууд залгана (утаснаасаа ажиллахад хялбар) */
  var PHONE_ICO = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 ' +
    '19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 ' +
    '6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
  function telLink(phone, extraCls) {
    var p = String(phone || "").trim();
    if (!p) return '<span class="ad-muted">Утас оруулаагүй</span>';
    var num = p.replace(/[^\d+]/g, "");
    return '<a class="ad-tel' + (extraCls ? " " + extraCls : "") + '" href="tel:' + esc(num) + '" aria-label="' +
      esc(p) + ' дугаар руу залгах">' + PHONE_ICO + "<span>" + esc(p) + "</span></a>";
  }

  /* Дараагийн алхам: Баглаж байна → «Баглаж дууссан», Багласан → «Хүргэлтэд гаргах»,
     Хүргэлтэд гарсан → «Хүргэгдсэн». Гараар төлөх (эсвэл төлөгдсөн) шинэ захиалга → «Баглаж эхлэх».
     QPay төлбөр хүлээгдэж буй захиалгад товч гарахгүй — төлбөр ормогц сервер өөрөө ахиулна. */
  function nextStep(o) {
    var s = orderStatus(o);
    if (s === "new") return awaitingPayment(o) ? null : { to: "packing", label: "Баглаж эхлэх" };
    return NEXT_STEP[s] || null;
  }
  function stepHTML(o, big) {
    var n = nextStep(o);
    if (n) {
      return '<button type="button" class="ad-step' + (big ? " ad-step--lg" : "") + '" data-ad="order-step" data-id="' +
        esc(o.id) + '" data-to="' + n.to + '">' + esc(n.label) +
        '<span class="ad-step__ico" aria-hidden="true">' + (n.to === "done" ? "✓" : "→") + "</span></button>";
    }
    if (awaitingPayment(o)) {
      return '<span class="ad-step-note">' +
        (o.payment.status === "pending" ? "Төлбөр хүлээгдэж байна" : "Төлбөр ороогүй") + "</span>";
    }
    return "";
  }

  function orderThead() {
    return "<thead><tr><th>Захиалга</th><th>Захиалагч</th><th>Дүн</th><th>Төлөв</th>" +
      "<th>Дараагийн алхам</th><th></th></tr></thead>";
  }
  /* Захиалгын мөр — утсан дээр CSS-ээр карт болж харагдана */
  function orderRow(o) {
    var c = o.customer || {};
    return '<tr class="ad-orow">' +
      '<td class="oc-code"><button type="button" class="ad-olink" data-ad="order-view" data-id="' + esc(o.id) + '">' +
        esc(o.code) + '</button><span class="ad-muted">' + esc(dateStr(o.createdAt)) + "</span></td>" +
      '<td class="oc-cust"><b>' + esc(c.name) + "</b>" + telLink(c.phone) + "</td>" +
      '<td class="oc-sum"><b>' + fmt(o.total) + '</b> <span class="ad-muted">· ' + itemCount(o) + " ш</span>" +
        '<div class="ad-otags">' + payTag(o) + "</div></td>" +
      '<td class="oc-status">' + statusBadge(o) + "</td>" +
      '<td class="oc-step">' + stepHTML(o) + "</td>" +
      '<td class="oc-more"><button type="button" class="btn btn--text btn--sm" data-ad="order-view" data-id="' +
        esc(o.id) + '">Дэлгэрэнгүй</button></td>' +
    "</tr>";
  }

  /* Төлбөрийн шошго: онлайн (QPay) эсвэл гараар */
  var PAY = {
    paid:      { label: "QPay · Төлсөн",           cls: "tag--paid" },
    pending:   { label: "QPay · Хүлээгдэж буй",    cls: "tag--pending" },
    expired:   { label: "QPay · Хугацаа дууссан",  cls: "tag--muted" },
    cancelled: { label: "QPay · Цуцлагдсан",       cls: "tag--muted" },
  };
  function payTag(o) {
    var p = o.payment;
    if (!p || p.method !== "qpay") return '<span class="tag tag--muted">Гараар</span>';
    var s = PAY[p.status] || { label: "QPay", cls: "tag--muted" };
    var label = s.label;
    if (p.status === "paid" && p.paidManually) label = "Гараар хүлээн авсан";
    var html = '<span class="tag ' + s.cls + '">' + esc(label) + "</span>";
    // ТЕСТ төлбөр — бодит мөнгө ороогүй; хүргэж болохгүй
    if (p.livemode === false) html += '<span class="tag tag--test">ТЕСТ</span>';
    if (p.refundNeeded) html += '<span class="tag tag--off">Буцаан олголт хэрэгтэй</span>';
    return html;
  }

  /* Шүүлтүүрийн chip-үүд (тоотой) */
  function orderChipsHTML() {
    return ORDER_FILTERS.map(function (c) {
      var n = c.count ? countOrders(c.key) : null;
      var active = state.orderFilter === c.key;
      if (c.hideEmpty && !n && !active) return "";
      return '<button type="button" class="filter-chip ad-chip' + (c.key === "todo" ? " ad-chip--todo" : "") +
        (active ? " is-active" : "") + '" data-ad="order-filter" data-filter="' + c.key + '" aria-pressed="' + active + '">' +
        esc(c.label) + (n != null ? ' <span class="ad-chip__n">' + n + "</span>" : "") + "</button>";
    }).join("");
  }

  var EMPTY_MSG = {
    todo:       "Одоогоор хийх ажил алга. Төлбөр нь орсон захиалга энд автоматаар гарч ирнэ.",
    packing:    "Баглах захиалга алга.",
    packed:     "Хүргэлтэд гаргах захиалга алга.",
    delivering: "Хүргэлтэд яваа захиалга алга.",
    awaiting:   "Төлбөр хүлээгдэж буй захиалга алга.",
  };

  function fillOrders() {
    var filter = state.orderFilter;
    var q = (state.search.orders || "").trim().toLowerCase();
    var matchQ = function (o) {
      var c = o.customer || {};
      return !q || (o.code + " " + c.name + " " + c.phone).toLowerCase().indexOf(q) > -1;
    };
    var list = state.orders.filter(function (o) { return matchFilter(o, filter) && matchQ(o); });

    var chips = u.qs("#ad-order-chips");
    if (chips) {
      chips.innerHTML = orderChipsHTML();
      scrollIntoRow(chips, u.qs(".filter-chip.is-active", chips));
    }

    var tb = u.qs("#ad-order-body");
    if (!tb) return;
    if (list.length) { tb.innerHTML = list.map(orderRow).join(""); return; }

    var msg;
    if (q) {
      // Хайлт одоогийн шүүлтүүрт олдоогүй ч бусад төлөвт байж магадгүй
      var elsewhere = state.orders.filter(matchQ).length;
      msg = "«" + esc(state.search.orders.trim()) + "» хайлтаар энэ хэсгээс захиалга олдсонгүй.";
      if (elsewhere && filter !== "all") {
        msg += '<br /><button type="button" class="btn btn--outline btn--sm ad-empty__btn" data-ad="order-filter" data-filter="all">' +
          "Бүх захиалгаас харах (" + elsewhere + ")</button>";
      }
    } else {
      msg = esc(EMPTY_MSG[filter] || "Захиалга олдсонгүй.");
    }
    tb.innerHTML = '<tr><td colspan="6" class="ad-empty">' + msg + "</td></tr>";
  }

  function renderOrders() {
    if (FILTER_KEYS.indexOf(state.orderFilter) === -1) state.orderFilter = "todo";
    main().innerHTML =
      pageHead("Захиалга",
        "Төлбөр орсон захиалга автоматаар «Баглаж байна» төлөвт орно. Дараагийн алхмын товчийг дарж төлвийг шинэчлээрэй.",
        searchBox("orders", "Код, нэр, утсаар хайх…") + refreshBtn()) +
      '<div class="ad-chipbar" id="ad-order-chips" role="toolbar" aria-label="Төлвөөр шүүх"></div>' +
      '<div class="ad-panel ad-panel--orders"><div class="ad-tablewrap"><table class="ad-table ad-otable">' +
        orderThead() + '<tbody id="ad-order-body"></tbody></table></div></div>';
    fillOrders();
    onSearch("orders", fillOrders);
  }

  /* Chip дарахад: шүүлтүүрийг солиод history-ийн одоогийн мөрөнд хадгална */
  function setOrderFilter(f) {
    if (FILTER_KEYS.indexOf(f) === -1) return;
    state.orderFilter = f;
    try { history.replaceState({ adminView: "orders", orderFilter: f }, "", "#orders"); } catch (e) {}
    if (state.view === "orders") fillOrders();
  }
  /* Хянах самбараас тодорхой шүүлтүүртэй захиалгын жагсаалт руу очих */
  function gotoOrders(f) {
    state.orderFilter = FILTER_KEYS.indexOf(f) > -1 ? f : "todo";
    state.search.orders = "";
    switchView("orders");
  }

  /* ------------------------------------------------------------------ */
  /*  Төлөв солих (нэг товчоор) ба шинэчлэх                              */
  /* ------------------------------------------------------------------ */
  var STEP_TOAST = {
    new:        "«Шинэ» төлөвт орлоо",
    packing:    "Баглаж эхэллээ",
    packed:     "Багласан гэж тэмдэглэлээ",
    delivering: "Хүргэлтэд гарлаа. Захиалагчид и-мэйлээр мэдэгдэнэ",
    done:       "Хүргэгдсэн гэж тэмдэглэлээ. Захиалагчид и-мэйлээр мэдэгдэнэ",
    cancelled:  "Захиалга цуцлагдлаа",
  };

  function stepOrder(id, to, btn) {
    var o = getOrder(id);
    if (!o || !STATUS[to]) return;
    var who = withDot(o.code + (o.customer && o.customer.name ? " · " + o.customer.name : ""));
    var run = function () { setOrderStatus(id, to, btn); };
    // Алхам бүрийг нэг удаа асууна — эзэн "Тийм" дараад л цааш явна
    var ask = STEP_CONFIRM[to];
    if (!ask) return run();
    confirmModal(ask.title, who + " " + ask.msg, run, "Тийм", false, "Үгүй");
  }

  /* Алхам бүрийн асуулт (и-мэйл очих эсэхийг тодорхой хэлнэ) */
  var STEP_CONFIRM = {
    packing:    { title: "Баглаж эхлэх үү?",   msg: "Захиалга «Баглаж байна» төлөвт орно." },
    packed:     { title: "Баглаж дууссан уу?", msg: "Захиалга «Багласан» төлөвт орно." },
    delivering: { title: "Хүргэлтэд гаргах уу?",
                  msg: "Захиалагчид «Захиалга хүргэлтэд гарлаа» гэсэн и-мэйл очно." },
    done:       { title: "Хүргэгдсэн үү?",
                  msg: "Хүргэлтийн ажилтан захиалгыг хүлээлгэн өгсөн бол «Тийм» дарна уу. " +
                       "Захиалагчид «Захиалга хүргэгдлээ» гэсэн и-мэйл очно." },
  };

  var busyOrders = {}; // давхар дарахаас сэргийлнэ
  async function setOrderStatus(id, status, btn) {
    if (busyOrders[id]) return;
    busyOrders[id] = true;
    var yes = u.qs("#ad-confirm-yes");
    if (yes) yes.disabled = true;
    if (btn) { btn.disabled = true; btn.classList.add("is-busy"); }
    try {
      await PM.api.patch("/orders/" + id, { status: status });
      await Promise.all([reloadOrders(), reloadStats()]);
      lastSync = Date.now();
      adClose();
      var o = getOrder(id);
      u.toast((o ? o.code + ": " : "") + (STEP_TOAST[status] || "Төлөв солигдлоо"), "success");
      refreshCurrentView();
    } catch (err) {
      adClose();
      u.toast(err.message, "error");
      if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove("is-busy"); }
    } finally {
      delete busyOrders[id];
    }
  }

  /* Одоогийн харагдацыг шинэ өгөгдлөөр дахин зурна (шүүлтүүр, хайлт хэвээр) */
  function refreshCurrentView() {
    updateNavBadge();
    if (state.view === "orders") fillOrders();
    else if (state.view === "dashboard") renderDashboard();
  }
  function updateNavBadge() {
    var el = u.qs("#ad-nav-todo");
    if (!el) return;
    var n = countOrders("todo");
    el.textContent = n;
    el.hidden = !n;
  }
  /* Серверээс захиалгыг дахин татах ("Шинэчлэх" товч, эсвэл апп руу буцаж ороход) */
  async function refreshOrders(btn, silent) {
    if (btn) btn.disabled = true;
    try {
      await Promise.all([reloadOrders(), reloadStats()]);
      lastSync = Date.now();
      refreshCurrentView();
      if (!silent) u.toast("Захиалгын мэдээлэл шинэчлэгдлээ", "info");
    } catch (err) {
      if (!silent) u.toast(err.message, "error");
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Захиалгын дэлгэрэнгүй                                              */
  /* ------------------------------------------------------------------ */
  /* Төлвийн түүх: statusHistory (хуучин захиалгад байхгүй бол одоогийн төлвөөр нөхнө)
     дээр төлбөр орсон мөчийг цаг хугацааных нь дарааллаар нэмнэ */
  function orderEvents(o) {
    var h = (Array.isArray(o.statusHistory) && o.statusHistory.length)
      ? o.statusHistory
      : [{ status: o.status, at: o.status === "new" ? o.createdAt : (o.updatedAt || o.createdAt) }];
    var ev = [];
    h.forEach(function (x) {
      if (!x || !x.status) return;
      var s = x.status === "confirmed" ? "packing" : x.status;
      var prev = ev[ev.length - 1];
      if (prev && prev.status === s) return; // дараалсан давхардлыг алгасна
      ev.push({ status: s, at: x.at });
    });
    if (!ev.length || ev[0].status !== "new") ev.unshift({ status: "new", at: o.createdAt });

    var p = o.payment;
    if (p && p.status === "paid" && p.paidAt) {
      var i = 1;
      while (i < ev.length && !(ev[i].at >= p.paidAt)) i++;
      ev.splice(i, 0, { pay: true, at: p.paidAt,
        label: p.paidManually ? "Төлбөрийг гараар хүлээн авсан" : "Төлбөр төлөгдсөн" });
    }
    return ev;
  }
  function tlItem(cls, label, when) {
    return '<li class="ad-tl__item ' + esc(cls) + '"><span class="ad-tl__dot" aria-hidden="true"></span>' +
      '<div class="ad-tl__body"><b>' + esc(label) + "</b>" + (when ? "<span>" + esc(when) + "</span>" : "") + "</div></li>";
  }
  /* Босоо явцын шугам: болсон алхмууд (огноотой) + цаашдын алхмууд (бүдэг) */
  function timelineHTML(o) {
    var ev = orderEvents(o);
    var lastIdx = -1;
    ev.forEach(function (x, i) { if (!x.pay) lastIdx = i; });
    var items = ev.map(function (x, i) {
      var label = x.pay ? x.label
        : x.status === "new" ? "Захиалга ирсэн"
        : (STATUS[x.status] ? STATUS[x.status].label : x.status);
      var cls = x.pay ? "is-pay" : "tl-" + x.status + (i === lastIdx ? " is-current" : "");
      return tlItem(cls, label, x.at ? dateStr(x.at) : "");
    });
    var cur = orderStatus(o);
    if (cur !== "done" && cur !== "cancelled") {
      if (awaitingPayment(o)) items.push(tlItem("is-todo", "Төлбөр төлөгдөх", ""));
      var idx = FLOW.indexOf(cur);
      if (idx > -1) FLOW.slice(idx + 1).forEach(function (k) { items.push(tlItem("is-todo", STATUS[k].label, "")); });
    }
    return '<ol class="ad-tl">' + items.join("") + "</ol>";
  }

  function openOrderDetail(id) {
    var o = getOrder(id);
    if (!o) return;
    var c = o.customer || {};
    var cur = orderStatus(o);
    var items = (o.items || []).map(function (it) {
      return "<tr><td>" + esc(it.brand + " " + it.name) + "</td><td>" + it.ml + " мл</td><td>" + it.qty +
        "</td><td>" + fmt(it.unitPrice) + "</td><td>" + fmt(it.lineTotal) + "</td></tr>";
    }).join("");

    var step = nextStep(o);
    var nextBox = step
      ? '<div class="ad-onext"><span class="ad-onext__label">Дараагийн алхам</span>' + stepHTML(o, true) +
          (step.to === "delivering" || step.to === "done"
            ? '<span class="ad-onext__hint">Дарахад захиалагчид и-мэйлээр мэдэгдэнэ.</span>' : "") +
        "</div>"
      : awaitingPayment(o)
        ? '<div class="ad-onext ad-onext--muted">Захиалагч QPay-ээр төлбөрөө төлмөгц захиалга автоматаар «Баглаж байна» төлөвт орно.</div>'
        : "";

    var html =
      '<div class="ad-form-wrap ad-odetail">' +
        '<div class="ad-order-head"><h3 class="modal__title">Захиалга <span class="ad-code">' + esc(o.code) + "</span></h3>" + statusBadge(o) + "</div>" +
        '<p class="ad-muted">' + esc(dateStr(o.createdAt)) + (o.userEmail ? " · " + esc(o.userEmail) : "") + "</p>" +
        nextBox +
        '<div class="ad-odgrid">' +
          '<div><h4 class="ad-subhead">Захиалагч</h4><div class="ad-ocust">' +
            '<b class="ad-ocust__name">' + esc(c.name) + "</b>" +
            telLink(c.phone, "ad-tel--lg") +
            (c.address ? '<p class="ad-ocust__line"><span>Хаяг</span>' + esc(c.address) + "</p>" : "") +
            (c.note ? '<p class="ad-ocust__line"><span>Тэмдэглэл</span>' + esc(c.note) + "</p>" : "") +
          "</div></div>" +
          '<div><h4 class="ad-subhead">Явц</h4>' + timelineHTML(o) + "</div>" +
        "</div>" +
        '<h4 class="ad-subhead">Бараа</h4>' +
        '<div class="ad-tablewrap"><table class="ad-table ad-table--sm"><thead><tr>' +
          "<th>Бараа</th><th>Хэмжээ</th><th>Тоо</th><th>Нэгж үнэ</th><th>Дүн</th></tr></thead><tbody>" + items + "</tbody></table></div>" +
        '<div class="ad-sum">' +
          "<div><span>Барааны дүн</span><b>" + fmt(o.subtotal) + "</b></div>" +
          "<div><span>Хүргэлт</span><b>" + (o.deliveryFee === 0 ? "Үнэгүй" : fmt(o.deliveryFee)) + "</b></div>" +
          '<div class="ad-sum__total"><span>Нийт</span><b>' + fmt(o.total) + "</b></div>" +
          "<div><span>Төлбөр</span><b>" + payTag(o) + "</b></div>" +
          (o.payment && o.payment.paidAt
            ? "<div><span>Төлсөн огноо</span><b>" + esc(dateStr(o.payment.paidAt)) + "</b></div>" : "") +
          (o.payment && o.payment.intentId
            ? '<div><span>Wire гүйлгээний дугаар</span><b class="ad-mono">' + esc(o.payment.intentId) + "</b></div>" : "") +
        "</div>" +
        (o.payment && o.payment.method === "qpay" && o.payment.status === "pending" && cur !== "cancelled"
          ? '<div class="ad-payact"><p class="ad-muted">Захиалагч QPay-ээр биш, данс руу эсвэл бэлнээр төлсөн бол:</p>' +
              '<button type="button" class="btn btn--outline btn--sm" data-ad="order-mark-paid" data-id="' + esc(o.id) + '">' +
              "Төлбөр хүлээн авснаа тэмдэглэх</button></div>"
          : "") +
        '<form id="ad-order-form">' +
          '<h4 class="ad-subhead">Мэдээлэл засах</h4>' +
          '<div class="ad-grid2">' +
            '<div class="field"><label>Нэр</label><input name="name" value="' + esc(c.name) + '" /></div>' +
            '<div class="field"><label>Утас</label><input name="phone" type="tel" value="' + esc(c.phone) + '" /></div>' +
          "</div>" +
          '<div class="field"><label>Хаяг</label><input name="address" value="' + esc(c.address || "") + '" /></div>' +
          '<div class="field"><label>Тэмдэглэл</label><input name="note" value="' + esc(c.note || "") + '" /></div>' +
          '<div class="field"><label for="ad-ostatus">Төлөвийг гараар өөрчлөх</label><select id="ad-ostatus" name="status">' +
            STATUS_ORDER.map(function (k) {
              return '<option value="' + k + '"' + (cur === k ? " selected" : "") + ">" + STATUS[k].label + "</option>";
            }).join("") +
          "</select>" +
          '<p class="ad-hint ad-hint--field">' +
            (step ? "Ихэвчлэн дээрх «Дараагийн алхам» товч л хангалттай. " : "") +
            "Алдаа засах үед эндээс дурын төлөвийг сонгож болно. " +
            "«Хүргэлтэд гарсан», «Хүргэгдсэн», «Цуцлагдсан» болгоход захиалагчид и-мэйл очно.</p></div>" +
          '<div class="ad-form-foot">' +
            '<button type="button" class="btn btn--text" data-ad="close-modal">Хаах</button>' +
            '<button type="submit" class="btn btn--solid">Хадгалах</button>' +
          "</div>" +
        "</form>" +
      "</div>";
    adOpen(html);

    u.qs("#ad-order-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var body = {
        customer: { name: f.name.value.trim(), phone: f.phone.value.trim(), address: f.address.value.trim(), note: f.note.value.trim() },
      };
      // Төлөв өөрчлөгдсөн үед л илгээнэ (хуучин "confirmed"-ийг дахин бичихгүй)
      if (f.status.value !== cur) body.status = f.status.value;
      var btn = f.querySelector('button[type="submit"]');
      var save = async function () {
        // Цуцлахыг асуусан үед товч нь баталгаажуулах цонхных байна
        var yes = u.qs("#ad-confirm-yes");
        if (yes) yes.disabled = true;
        if (btn) btn.disabled = true;
        try {
          await PM.api.patch("/orders/" + id, body);
          await Promise.all([reloadOrders(), reloadStats()]);
          lastSync = Date.now();
          adClose();
          u.toast(body.status ? o.code + ": " + (STEP_TOAST[body.status] || "Төлөв солигдлоо") : "Захиалга хадгалагдлаа", "success");
          refreshCurrentView();
        } catch (err) {
          u.toast(err.message, "error");
          if (yes && yes.isConnected) yes.disabled = false;
          if (btn && btn.isConnected) btn.disabled = false;
        }
      };
      if (body.status === "cancelled") {
        var p = o.payment || {};
        var refund = p.method === "qpay" && p.status === "paid" && !p.paidManually;
        return confirmModal("Захиалгыг цуцлах уу?",
          withDot(o.code + (c.name ? " · " + c.name : "")) + " " +
          (refund ? "Захиалагч QPay-ээр төлсөн тул мөнгийг нь буцааж олгох шаардлагатай гэж тэмдэглэгдэнэ. " : "") +
          "Захиалагчид цуцалсан тухай и-мэйл очно.",
          save, "Тийм, цуцлах", true);
      }
      save();
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
      : '<span class="tag tag--off">Баталгаажаагүй</span>';
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
      pageHead("Хэрэглэгч", state.users.length + " бүртгэлтэй үйлчлүүлэгч", searchBox("customers", "Нэр, и-мэйл, утсаар хайх…")) +
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
      return '<tr class="ad-clickable" data-ad="order-view" data-id="' + esc(o.id) + '">' +
        "<td><b>" + esc(o.code) + "</b></td><td>" + esc(dateStr(o.createdAt)) + "</td>" +
        "<td>" + itemCount(o) + " ш</td>" +
        "<td><b>" + fmt(o.total) + "</b></td>" +
        "<td>" + statusBadge(o) + "</td></tr>";
    }).join("") : '<tr><td colspan="5" class="ad-empty">Одоогоор захиалга хийгээгүй байна.</td></tr>';
    adOpen(
      '<div class="ad-form-wrap">' +
        '<h3 class="modal__title">' + esc(c.name) + "</h3>" +
        '<p class="ad-muted">' + esc(c.email) + " · Бүртгүүлсэн: " + esc(dateStr(c.createdAt)) + "</p>" +
        (c.phone ? '<p class="ad-cphone">' + telLink(c.phone, "ad-tel--lg") + "</p>" : "") +
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
      : '<p class="ad-empty">Одоогоор сэтгэгдэл алга. Дээрх талбараас шинээр нэмээрэй.</p>';
  }
  function renderReviewsView() {
    main().innerHTML =
      pageHead("Сэтгэгдэл", state.reviews.length + " сэтгэгдэл нүүр хуудас дээр харагдаж байна") +
      '<div class="ad-panel ad-panel--pad">' +
        '<form id="ad-review-form" class="ad-review-form">' +
          '<textarea name="text" rows="2" placeholder="Үйлчлүүлэгчийн сэтгэгдэл…" required></textarea>' +
          '<div class="ad-review-form__foot">' +
            '<input name="author" placeholder="Нэр (жишээ нь: Болд, Улаанбаатар)" />' +
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
  /* Онлайн захиалгын төлбөрийг гараар (данс/бэлэн) хүлээн авсныг тэмдэглэх */
  function confirmMarkPaid(id) {
    var o = getOrder(id);
    if (!o) return;
    confirmModal("Төлбөр хүлээн авсан уу?",
      "Захиалга " + o.code + " · " + fmt(o.total) + ". Мөнгө таны дансанд орсон эсвэл бэлнээр төлөгдсөн эсэхийг шалгаад баталгаажуулна уу. " +
      "Ингэснээр QPay-ийн нээлттэй нэхэмжлэх хаагдаж, захиалга «Баглаж байна» төлөвт орох бөгөөд захиалагчид баталгаажуулах и-мэйл очно.",
      async function () {
        var yes = u.qs("#ad-confirm-yes");
        if (yes) yes.disabled = true;
        try {
          await PM.api.patch("/orders/" + id, { paymentReceived: true });
          await Promise.all([reloadOrders(), reloadStats()]);
          lastSync = Date.now();
          adClose();
          u.toast("Төлбөрийг хүлээн авсан гэж тэмдэглэлээ", "success");
          refreshCurrentView();
        } catch (err) { adClose(); u.toast(err.message, "error"); }
      }, "Тийм, хүлээн авсан");
  }

  function confirmDeleteReview(id) {
    confirmModal("Сэтгэгдэл устгах уу?", "Энэ сэтгэгдлийг бүрмөсөн устгана. Нүүр хуудас дээр дахин харагдахгүй.", async function () {
      try {
        await PM.api.del("/reviews/" + id);
        await reloadReviews();
        adClose();
        u.toast("Сэтгэгдэл устгагдлаа", "info");
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
          '<div class="field"><label>Шинэ нууц үгээ дахин оруулах</label><input type="password" name="pw2" autocomplete="new-password" minlength="6" required /></div>' +
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
      if (f.pw1.value !== f.pw2.value) return showErr("Давтан оруулсан нууц үг таарахгүй байна.");
      if (f.pw1.value.length < 6) return showErr("Нууц үг дор хаяж 6 тэмдэгттэй байх ёстой.");
      var btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await PM.api.patch("/auth/me", { currentPassword: f.current.value, newPassword: f.pw1.value });
        adClose();
        u.toast("Нууц үг солигдлоо", "success");
      } catch (err) {
        showErr(err.message);
        btn.disabled = false;
      }
    });
  }

  /* ================================================================== */
  /*  Баталгаажуулах modal                                              */
  /* ================================================================== */
  /* danger === true бол улаан (аюултай үйлдэл) товч; yesLabel байхгүй бол "устгах" гэж үзнэ */
  function confirmModal(title, msg, onYes, yesLabel, danger, noLabel) {
    adOpen(
      '<div class="ad-confirm">' +
        "<h3>" + esc(title) + "</h3><p>" + esc(msg) + "</p>" +
        '<div class="ad-form-foot">' +
          '<button type="button" class="btn btn--text" data-ad="close-modal">' + esc(noLabel || "Болих") + "</button>" +
          '<button type="button" class="btn btn--solid' + (yesLabel && !danger ? "" : " ad-danger-btn") + '" id="ad-confirm-yes">' +
            esc(yesLabel || "Тийм, устгах") + "</button>" +
        "</div>" +
      "</div>"
    );
    var yes = u.qs("#ad-confirm-yes");
    yes.addEventListener("click", onYes);
    // Аюулгүй үйлдэлд "Тийм" дээр шууд focus — Enter эсвэл нэг товшилтоор баталгаажна
    if (yesLabel && !danger) setTimeout(function () { yes.focus(); }, 180);
  }

  /* ================================================================== */
  /*  Туслахууд                                                          */
  /* ================================================================== */
  function opt(val, label, cur) {
    return '<option value="' + val + '"' + (cur === val ? " selected" : "") + ">" + label + "</option>";
  }
  /* Өгүүлбэрийн төгсгөлд цэг — "Тэмүүлэн Д." гэх мэт цэгээр төгссөн бол давхарлахгүй */
  function withDot(s) {
    s = String(s || "").trim();
    return /[.!?…]$/.test(s) ? s : s + ".";
  }
  function genderLabel(g) { return g === "men" ? "Эрэгтэй" : g === "women" ? "Эмэгтэй" : "Унисекс"; }
  function splitNotes(str) {
    return (str || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  /* Хэвтээ гүйдэг мөрөнд (утсан дээрх цэс, chip) тухайн элементийг голлуулж харуулна.
     Хуудсыг босоо чиглэлд гүйлгэхгүй. */
  function scrollIntoRow(row, el) {
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    var r = row.getBoundingClientRect(), e = el.getBoundingClientRect();
    row.scrollLeft += (e.left + e.width / 2) - (r.left + r.width / 2);
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
      case "order-step": stepOrder(id, el.getAttribute("data-to"), el); break;
      case "order-filter": setOrderFilter(el.getAttribute("data-filter")); break;
      case "goto-orders": gotoOrders(el.getAttribute("data-filter")); break;
      case "orders-refresh": refreshOrders(el); break;
      case "order-mark-paid": confirmMarkPaid(id); break;
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
    var f = e.state && e.state.orderFilter;
    if (f && FILTER_KEYS.indexOf(f) > -1) state.orderFilter = f;
    adClose();
    switchView(v, false);
  });

  // Утсан дээр өөр апп руу шилжээд буцаж ороход шинэ захиалгыг чимээгүй татна
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !u.qs(".ad-nav")) return;
    if (Date.now() - lastSync < 30000) return;
    if (state.view !== "orders" && state.view !== "dashboard") return;
    refreshOrders(null, true);
  });

  // Overlay дарахад modal хаах
  var ov = u.qs("#ad-overlay");
  if (ov) ov.addEventListener("click", adClose);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") adClose(); });

  /* Эхлүүлэх */
  ensureAdmin();
})();
