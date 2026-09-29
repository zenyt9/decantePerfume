/**
 * app.js — Програмын эхлэл ба үйл явдлын холболт
 * =====================================================================
 * Модулиудыг нэгтгэж, DOM үйл явдлыг сонсоно. Хамгийн сүүлд ачаалагдана.
 *   • Бараа, session-ийг backend-ээс ачаална
 *   • Зочин ч сагслах боломжтой; захиалга өгөхөд нэвтрэлт шаардана
 *   • Захиалгыг серверт үүсгэнэ
 */
(function () {
  "use strict";
  var u = PM.utils;

  var filterState = { category: "all", query: "", sort: "featured" };
  var catalogReady = false; // бараа ачаалагдсан эсэх
  var catalogList = [];     // одоогийн шүүлтийн бүх үр дүн
  var catalogShown = 0;     // үүнээс хэдийг нь зурсан

  /* Эхэндээ харуулах барааны тоо (гар утсанд цөөн) */
  function pageSize() { return window.innerWidth <= 720 ? 8 : 12; }

  /* ================================================================== */
  /*  Каталогийн шүүлт ба эрэмбэлэлт                                     */
  /* ================================================================== */
  function applyFilters() {
    // Бараа ачаалагдаагүй байхад шүүлт дарвал зөвхөн төлвийг хадгална (ачаалсны дараа хэрэгжинэ)
    if (!catalogReady) return;
    var list = PM.products.items.slice();

    if (filterState.category === "popular") {
      list = list.filter(function (p) { return p.popular; });
    } else if (filterState.category === "sale") {
      list = list.filter(function (p) { return PM.products.hasDiscount(p); });
    } else if (filterState.category !== "all") {
      list = list.filter(function (p) { return p.gender === filterState.category; });
    }

    var q = filterState.query.trim().toLowerCase();
    if (q) {
      list = list.filter(function (p) {
        var notes = [].concat(p.notes.top || [], p.notes.heart || [], p.notes.base || []).join(" ");
        return (p.name + " " + p.brand + " " + notes).toLowerCase().indexOf(q) > -1;
      });
    }

    switch (filterState.sort) {
      case "price-asc":  list.sort(function (a, b) { return PM.products.minPrice(a) - PM.products.minPrice(b); }); break;
      case "price-desc": list.sort(function (a, b) { return PM.products.minPrice(b) - PM.products.minPrice(a); }); break;
      case "name":       list.sort(function (a, b) { return a.name.localeCompare(b.name); }); break;
      case "new":        list.sort(function (a, b) { return (b.year || 0) - (a.year || 0); }); break;
      default:           list.sort(function (a, b) { return (b.popular ? 1 : 0) - (a.popular ? 1 : 0); });
    }

    // Шүүлт/хайлт/эрэмбэ өөрчлөгдөх бүрд эхний хуудас руу буцна
    catalogList = list;
    catalogShown = PM.ui.renderProducts(list, pageSize());
    var counter = u.qs("#result-count");
    if (counter) counter.textContent = list.length + " бүтээгдэхүүн";
  }

  /* "Цааш үзэх" — үлдсэн бүх барааг харуулна */
  function showMoreProducts() {
    if (catalogShown >= catalogList.length) return;
    PM.ui.appendProducts(catalogList, catalogShown);
    catalogShown = catalogList.length;
  }

  /* Хямдралтай бараа байхгүй бол "Хямдрал" шүүлтүүрийг нууна
     (index.html-д анхнаасаа нуугдсан — ачаалсны дараа хямдрал байвал л харагдана) */
  function syncSaleChip() {
    var chip = u.qs('.filter-chip[data-category="sale"]');
    if (!chip) return;
    var anySale = PM.products.items.some(function (p) { return PM.products.hasDiscount(p); });
    chip.hidden = !anySale;
    if (!anySale && filterState.category === "sale") {
      var all = u.qs('.filter-chip[data-category="all"]');
      if (all) all.click();
    }
  }

  /* ================================================================== */
  /*  Каталог ачаалах (алдаа гарвал "Дахин ачаалах" товч)                 */
  /* ================================================================== */
  var LOADING_HTML = '<p class="catalog-loading">Ачаалж байна…</p>';

  async function loadCatalog() {
    var grid = u.qs("#product-grid");
    try {
      await PM.products.load();
      catalogReady = true;
      syncSaleChip();
      applyFilters();
      // Сагсыг бараа ачаалагдсаны дараа дахин зурна (өмнө нь бараа танигдаагүй тул хоосон харагдана)
      PM.ui.renderCart(PM.cart.state());
      return true;
    } catch (err) {
      // Техникийн алдааг хэрэглэгчид биш, зөвхөн console-д харуулна
      console.error("Бараа ачаалахад алдаа гарлаа:", err);
      if (grid) grid.innerHTML =
        '<div class="load-error">' +
          "<p>Уучлаарай, бараа ачаалахад алдаа гарлаа. Хуудсаа дахин ачаалж үзнэ үү.</p>" +
          '<button type="button" class="btn btn--outline" data-action="retry-products">Дахин ачаалах</button>' +
        "</div>";
      return false;
    }
  }

  function retryCatalog() {
    var grid = u.qs("#product-grid");
    if (grid) grid.innerHTML = LOADING_HTML;
    loadCatalog();
  }

  /* ================================================================== */
  /*  Хэмжээ сонгох                                                      */
  /* ================================================================== */
  function handleSizeSelect(chip, container) {
    var ml = Number(chip.getAttribute("data-size"));
    var product = PM.products.getById(container.getAttribute("data-id"));
    if (!product) return;
    container.setAttribute("data-size", ml);
    u.qsa(".size-chip", container).forEach(function (c) {
      var on = c === chip;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
    });
    var priceEl = u.qs('[data-role="price"]', container);
    if (priceEl) priceEl.innerHTML = PM.ui.priceMarkup(product, ml);
  }

  /* ================================================================== */
  /*  Сагсны drawer                                                      */
  /* ================================================================== */
  function openCart() {
    document.body.classList.add("cart-open");
    var d = u.qs("#cart-drawer");
    if (d) d.setAttribute("aria-hidden", "false");
    PM.modal.syncOverlay();
    // Focus-ийг drawer-ийн "Хаах" товч руу шилжүүлнэ
    var x = u.qs("#cart-drawer .cart-drawer__head [data-action='close-cart']");
    if (x) x.focus({ preventScroll: true });
  }
  function closeCart() {
    var wasOpen = document.body.classList.contains("cart-open");
    document.body.classList.remove("cart-open");
    var d = u.qs("#cart-drawer");
    if (d) d.setAttribute("aria-hidden", "true");
    PM.modal.syncOverlay();
    // Хаахад focus-ийг толгой дахь сагсны товч руу буцаана (нээлттэй байсан үед л)
    if (wasOpen) {
      var btn = u.qs("#site-header [data-action='open-cart']");
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  /* ================================================================== */
  /*  Сагслах (зочин ч сагслах боломжтой — нэвтрэлтийг захиалахад шаардана) */
  /* ================================================================== */
  function addFromContainer(container) {
    if (!container) return;
    var id = container.getAttribute("data-id");
    var ml = Number(container.getAttribute("data-size"));
    var product = PM.products.getById(id);
    if (!product) return;
    if (PM.products.stockInfo(product).soldOut) {
      u.toast("Уучлаарай, энэ үнэр одоогоор дууссан байна.", "error");
      return;
    }
    doAdd(product, id, ml);
  }
  function doAdd(product, id, ml) {
    PM.cart.add(id, ml);
    u.toast(product.name + " (" + ml + " мл) сагсанд нэмэгдлээ.", "success");
  }

  /* ================================================================== */
  /*  Захиалга үүсгэх (серверт)                                          */
  /* ================================================================== */
  async function submitOrder(form) {
    var state = PM.cart.state();
    if (state.isEmpty) {
      u.toast("Сагс тань хоосон байна. Эхлээд дуртай үнэрээ сонгоорой.", "error");
      scrollTo("#products");
      return;
    }
    if (!PM.session.isAuthed()) {
      PM.session.openAuth({
        message: "Захиалга өгөхийн тулд эхлээд нэвтэрнэ үү.",
        onSuccess: function () { submitOrder(form); },
      });
      return;
    }
    var data = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      address: form.address.value.trim(),
      note: form.note.value.trim(),
    };
    if (!data.name || !data.phone) {
      u.toast("Нэр болон утасны дугаараа оруулна уу.", "error");
      return;
    }
    var items = state.lineItems.map(function (li) {
      return { productId: li.id, ml: li.ml, qty: li.qty };
    });

    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      var r = await PM.api.post("/orders", {
        items: items, name: data.name, phone: data.phone,
        address: data.address, note: data.note,
      });
      PM.cart.clear();
      form.reset();
      closeCart();
      // Сервер төлбөрийн хэлбэрийг шийднэ: QPay идэвхтэй бол шууд төлбөрийн хуудас руу
      var pay = r.order && r.order.payment;
      if (pay && pay.method === "qpay") startPayment(r.order.id);
      else showOrderSuccess(r.order);
    } catch (err) {
      u.toast(err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ================================================================== */
  /*  Онлайн төлбөр (QPay · Wire-ээр)                                     */
  /* ================================================================== */
  /* QPay идэвхтэй бол захиалгын товч, тайлбарыг төлбөрийн урсгалд тааруулна */
  function loadPayConfig() {
    PM.api.get("/settings").then(function (s) {
      if (!s || !s.payments || !s.payments.qpay) return;
      var btn = u.qs("#order-submit");
      var hint = u.qs("#order-hint");
      if (btn) btn.textContent = "Захиалаад QPay-ээр төлөх";
      if (hint) hint.textContent = s.payments.testMode
        ? "* ТЕСТ горим (зөвхөн админд харагдана). Төлбөр туршилтын орчинд явагдах тул бодит мөнгө шилжихгүй."
        : "* Товчийг дарахад QPay-ийн төлбөрийн хуудас нээгдэнэ. Аль ч банкны аппаар эсвэл QR кодоор төлөх боломжтой.";
    }).catch(function () {});
  }

  function payModal(inner) {
    PM.modal.open('<div class="checkout paystate">' + inner + "</div>");
  }

  /* Төлөв шалгах давталт — нэг л давталт идэвхтэй байна (token-оор хуучныг зогсооно) */
  var payPoll = null;
  var pollToken = 0;
  function stopPoll() {
    pollToken++;
    if (payPoll) clearTimeout(payPoll);
    payPoll = null;
  }

  /** Төлбөрийн хуудас (pay.wire.mn) руу шилжүүлэх */
  async function startPayment(orderId) {
    stopPoll();
    payModal(
      '<div class="paystate__spin" aria-hidden="true"></div>' +
      '<h3 class="checkout__title">QPay руу шилжиж байна…</h3>' +
      '<p class="checkout__lead">Төлбөрийн хуудсыг нээж байна, түр хүлээнэ үү.</p>'
    );
    try {
      var r = await PM.api.post("/orders/" + encodeURIComponent(orderId) + "/pay", {});
      if (r.paid) return checkPaymentReturn(orderId);
      if (r.url && /^https:\/\//.test(r.url)) { window.location.href = r.url; return; }
      throw new Error("Төлбөрийн холбоос олдсонгүй.");
    } catch (err) {
      payModal(
        '<div class="checkout__badge checkout__badge--warn" aria-hidden="true">!</div>' +
        '<h3 class="checkout__title">Төлбөрийн хуудас нээгдсэнгүй</h3>' +
        '<p class="checkout__lead">' + u.escapeHtml(err.message) + "<br />" +
          "Санаа зоволтгүй, таны захиалга хадгалагдсан байна. Доорх товчоор дахин оролдоно уу. Болохгүй бол бидэнтэй холбогдоорой.</p>" +
        '<div class="checkout__actions">' +
          '<button type="button" class="btn btn--solid btn--block" data-action="pay-order" data-id="' +
            u.escapeHtml(orderId) + '">Дахин оролдох</button>' +
          '<button type="button" class="btn btn--text btn--block" data-action="open-orders">Миний захиалга</button>' +
        "</div>"
      );
    }
  }

  /**
   * Төлбөрийн хуудаснаас буцаж ирэхэд (?order=ID) төлөвийг шалгана.
   * Төлбөр банкнаас хэдэн секундийн дараа баталгаажиж болох тул хэсэг хугацаанд poll хийнэ.
   */
  function checkPaymentReturn(orderId) {
    stopPoll();
    var token = pollToken;
    var tries = 0, fails = 0;
    var MAX_TRIES = 40; // ~2 минут
    payModal(
      '<div class="paystate__spin" aria-hidden="true"></div>' +
      '<h3 class="checkout__title">Төлбөрийг шалгаж байна…</h3>' +
      '<p class="checkout__lead">Түр хүлээнэ үү.</p>'
    );
    var tick = async function () {
      if (token !== pollToken) return;
      tries++;
      var s;
      try {
        s = await PM.api.get("/orders/" + encodeURIComponent(orderId) + "/payment");
        fails = 0;
      } catch (err) {
        fails++;
        if (token !== pollToken) return;
        if (err.status === 401 || err.status === 404 || tries >= MAX_TRIES) {
          payModal('<h3 class="checkout__title">Төлбөрийг шалгаж чадсангүй</h3>' +
            '<p class="checkout__lead">' + u.escapeHtml(err.message) + "<br />" +
              "Захиалгынхаа явцыг “Миний захиалга” хэсгээс харах боломжтой.</p>" +
            '<div class="checkout__actions"><button type="button" class="btn btn--solid btn--block" data-action="open-orders">Миний захиалга</button></div>');
          return;
        }
        // Сүлжээ түр тасарсан — зөөлөн мэдэгдээд дахин оролдоно
        if (fails >= 3) payModal('<div class="paystate__spin" aria-hidden="true"></div>' +
          '<h3 class="checkout__title">Холболт түр тасарлаа…</h3>' +
          '<p class="checkout__lead">Дахин шалгаж байна. Хэрэв та төлсөн бол төлбөр тань хадгалагдсан байгаа тул санаа зовох хэрэггүй.</p>');
        payPoll = setTimeout(tick, Math.min(15000, 3000 * fails));
        return;
      }
      // Хэрэглэгч цонхыг хаасан эсвэл өөр үйлдэл эхлүүлсэн бол зогсооно
      if (token !== pollToken) return;
      if (tries > 1 && !u.qs(".paystate")) { stopPoll(); return; }
      if (s.status === "paid") return showPaid(s);
      if (s.status === "expired" || s.orderStatus === "cancelled") return showExpired(s);
      showPending(s, tries >= MAX_TRIES);
      if (tries < MAX_TRIES) payPoll = setTimeout(tick, 3000);
    };
    tick();
  }

  function showPaid(s) {
    stopPoll();
    payModal(
      '<div class="checkout__badge" aria-hidden="true">✓</div>' +
      '<h3 class="checkout__title">Төлбөр амжилттай хийгдлээ</h3>' +
      '<p class="checkout__lead">Таны <b>' + u.escapeHtml(s.code) + "</b> дугаартай захиалгын төлбөр (" + u.formatPrice(s.total) +
        ") орлоо." + (s.test ? " <b>(ТЕСТ: бодит мөнгө шилжээгүй)</b>" : "") +
        "<br />Захиалгын мэдээллийг таны и-мэйл хаяг руу илгээлээ. Хүргэлтээ тохирохоор бид удахгүй тантай холбогдоно. Биднийг сонгосонд баярлалаа!</p>" +
      '<div class="checkout__actions">' +
        '<button type="button" class="btn btn--solid btn--block" data-action="open-orders">Миний захиалга</button>' +
        '<button type="button" class="btn btn--text btn--block" data-action="close-modal">Үргэлжлүүлэн дэлгүүр хэсэх</button>' +
      "</div>"
    );
  }

  function showExpired(s) {
    stopPoll();
    payModal(
      '<div class="checkout__badge checkout__badge--warn" aria-hidden="true">!</div>' +
      '<h3 class="checkout__title">Захиалга цуцлагдлаа</h3>' +
      '<p class="checkout__lead">Таны <b>' + u.escapeHtml(s.code) + "</b> дугаартай захиалга хугацаандаа төлөгдөөгүй тул цуцлагдлаа. " +
        "Хүсвэл бараагаа дахин сагсанд нэмээд шинээр захиалаарай.</p>" +
      '<div class="checkout__actions"><button type="button" class="btn btn--solid btn--block" data-action="close-modal">Ойлголоо</button></div>'
    );
  }

  function showPending(s, gaveUp) {
    // processing — банк баталгаажуулж байна; requires_action — нэхэмжлэх нээлттэй, төлөөгүй байж болно
    var processing = s.intentStatus === "processing";
    var open = s.intentStatus === "requires_action";
    var title = processing ? "Төлбөр баталгаажиж байна…"
      : open ? "Төлбөр хүлээгдэж байна"
      : "Төлбөр хараахан хийгдээгүй байна";
    var text = processing
      ? "Банк таны төлбөрийг баталгаажуулж байна. Энэ цонхыг хаасан ч төлбөр ормогц захиалга тань автоматаар баталгаажна."
      : open
        ? "Банкны аппаараа төлсөн бол хэдэн секунд хүлээнэ үү, мэдээлэл өөрөө шинэчлэгдэнэ. Хараахан төлөөгүй бол доорх товчоор төлбөрийн хуудсаа дахин нээнэ үү."
        : "Хэрэв та төлсөн бол хэдэн секунд хүлээнэ үү, мэдээлэл өөрөө шинэчлэгдэнэ. Төлөөгүй бол доорх товчоор төлнө үү.";
    payModal(
      (gaveUp ? "" : '<div class="paystate__spin" aria-hidden="true"></div>') +
      '<h3 class="checkout__title">' + title + "</h3>" +
      '<p class="checkout__lead">Захиалгын дугаар: <b>' + u.escapeHtml(s.code) + "</b> · " + u.formatPrice(s.total) + "<br />" + text + "</p>" +
      '<div class="checkout__actions">' +
        (s.canRetry && !processing
          ? '<button type="button" class="btn btn--solid btn--block" data-action="pay-order" data-id="' +
              u.escapeHtml(s.orderId) + '">' + (open ? "Төлбөрийн хуудсыг нээх" : "QPay-ээр төлөх") + "</button>"
          : "") +
        '<button type="button" class="btn btn--text btn--block" data-action="open-orders">Миний захиалга</button>' +
      "</div>"
    );
  }

  /* Төлбөрийн хуудаснаас буцаж ирсэн эсэх (?order=ID) — URL-ийг цэвэрлээд шалгана */
  function handlePaymentReturn() {
    var params = new URLSearchParams(window.location.search);
    var orderId = params.get("order");
    if (!orderId || !/^order_[a-f0-9]+$/.test(orderId)) return;
    params.delete("order");
    var qs = params.toString();
    history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
    if (!PM.session.isAuthed()) {
      PM.session.openAuth({
        message: "Захиалгынхаа төлбөрийг шалгахын тулд нэвтэрнэ үү.",
        onSuccess: function () { checkPaymentReturn(orderId); },
      });
      return;
    }
    checkPaymentReturn(orderId);
  }

  /** Захиалгыг текстээр (мессенжерт илгээх / хуулах) */
  function orderToText(order) {
    var lines = [];
    lines.push(PM.CONFIG.brand.name + " · Захиалга " + order.code);
    lines.push("————————————————");
    order.items.forEach(function (it, i) {
      lines.push((i + 1) + ". " + it.brand + " " + it.name + " · " + it.ml + " мл × " +
        it.qty + " = " + u.formatPrice(it.lineTotal));
    });
    lines.push("————————————————");
    lines.push("Барааны дүн: " + u.formatPrice(order.subtotal));
    lines.push("Хүргэлт: " + (order.deliveryFee === 0 ? "Үнэгүй" : u.formatPrice(order.deliveryFee)));
    lines.push("Нийт: " + u.formatPrice(order.total));
    lines.push("————————————————");
    lines.push("Нэр: " + order.customer.name);
    lines.push("Утас: " + order.customer.phone);
    if (order.customer.address) lines.push("Хаяг: " + order.customer.address);
    if (order.customer.note) lines.push("Тэмдэглэл: " + order.customer.note);
    return lines.join("\n");
  }

  function showOrderSuccess(order) {
    var text = orderToText(order);
    var c = PM.CONFIG.contact;
    var html =
      '<div class="checkout">' +
        '<div class="checkout__badge" aria-hidden="true">✓</div>' +
        '<h3 class="checkout__title">Захиалга тань бүртгэгдлээ</h3>' +
        '<p class="checkout__lead">Захиалгын дугаар: <b>' + u.escapeHtml(order.code) + "</b><br />" +
          "Бид удахгүй тантай холбогдож захиалгыг баталгаажуулна. Захиалгынхаа явцыг “Миний захиалга” хэсгээс харах боломжтой.</p>" +
        '<pre class="checkout__summary">' + u.escapeHtml(text) + "</pre>" +
        '<div class="checkout__actions">' +
          '<a class="btn btn--solid btn--block" href="' + u.escapeHtml(c.messenger) +
            '" target="_blank" rel="noopener">Мессенжерээр мэдэгдэх</a>' +
          '<button type="button" class="btn btn--text btn--block" data-action="copy-order" ' +
            'data-order="' + encodeURIComponent(text) + '">Захиалгын мэдээллийг хуулах</button>' +
        "</div>" +
      "</div>";
    PM.modal.open(html);
  }

  /* ================================================================== */
  /*  Үйл явдлын делегаци                                                */
  /* ================================================================== */
  function onClick(e) {
    var t = e.target;

    // Хэрэглэгчийн цэсний гадна дарвал хаах
    if (!t.closest("#account-area")) PM.session.toggleMenu(false);

    // Хэмжээ сонгох
    var chip = t.closest(".size-chip");
    if (chip) {
      var box = chip.closest("[data-id]");
      if (box) handleSizeSelect(chip, box);
      return;
    }

    var actEl = t.closest("[data-action]");
    if (!actEl) return;
    var action = actEl.getAttribute("data-action");

    switch (action) {
      case "home":
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        document.body.classList.remove("nav-open");
        break;
      case "legal":
        e.preventDefault();
        openLegal(actEl.getAttribute("data-legal"));
        break;
      case "open-cart":   openCart(); break;
      case "close-cart":  closeCart(); break;
      case "close-modal": PM.modal.close(); break;

      /* --- Хэрэглэгч --- */
      case "open-auth":     PM.session.openAuth({}); break;
      case "toggle-account": PM.session.toggleMenu(); break;
      case "open-profile":  PM.session.toggleMenu(false); PM.session.openProfile(); break;
      case "open-orders":   PM.session.toggleMenu(false); PM.session.openOrders(); break;
      case "logout":        PM.session.toggleMenu(false); PM.session.logout(); break;

      /* --- Quick view --- */
      case "quickview": {
        var card = actEl.closest("[data-id]");
        var p = PM.products.getById(card.getAttribute("data-id"));
        if (p) PM.ui.renderQuickView(p);
        break;
      }

      /* --- Сагслах --- */
      case "add":       addFromContainer(actEl.closest(".card")); break;
      // Нэвтрэлт шаардахгүй болсон тул нэмээд цонхыг шууд хаана
      case "add-modal": addFromContainer(actEl.closest(".qv")); PM.modal.close(); break;

      /* --- Каталог --- */
      case "more-products":  showMoreProducts(); break;
      case "retry-products": retryCatalog(); break;

      /* --- Сагсны мөр --- */
      case "inc":
      case "dec":
      case "remove": {
        var line = actEl.closest(".cart-line");
        if (!line) break;
        var id = line.getAttribute("data-id");
        var ml = Number(line.getAttribute("data-size"));
        var li = findLine(id, ml);
        if (!li) break;
        if (action === "remove") PM.cart.remove(id, ml);
        else PM.cart.setQty(id, ml, li.qty + (action === "inc" ? 1 : -1));
        break;
      }

      case "clear-cart":
        PM.cart.clear();
        u.toast("Сагс хоосорлоо.", "info");
        break;

      case "checkout":
        closeCart();
        scrollTo("#order");
        break;

      case "pay-order":
        startPayment(actEl.getAttribute("data-id"));
        break;

      case "copy-order": {
        var orderText = decodeURIComponent(actEl.getAttribute("data-order") || "");
        u.copyText(orderText).then(function () { u.toast("Захиалгын мэдээллийг хууллаа.", "success"); });
        break;
      }
    }
  }

  function findLine(id, ml) {
    var lines = PM.cart.state().lineItems;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].id === id && lines[i].ml === ml) return lines[i];
    }
    return null;
  }

  function scrollTo(sel) {
    var el = u.qs(sel);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ================================================================== */
  /*  Холболтууд                                                        */
  /* ================================================================== */
  function bindFilters() {
    u.qsa(".filter-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterState.category = btn.getAttribute("data-category");
        u.qsa(".filter-chip").forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", String(on));
        });
        applyFilters();
      });
    });
    var search = u.qs("#search");
    if (search) {
      filterState.query = search.value; // хөтөч талбарын утгыг сэргээсэн байж болно
      search.addEventListener("input", u.debounce(function () {
        filterState.query = search.value; applyFilters();
      }, 180));
    }
    var sort = u.qs("#sort");
    if (sort) {
      filterState.sort = sort.value;
      sort.addEventListener("change", function () {
        filterState.sort = sort.value; applyFilters();
      });
    }
  }

  function bindOrderForm() {
    var form = u.qs("#order-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submitOrder(form);
    });
  }

  function prefillOrderForm(usr) {
    var form = u.qs("#order-form");
    if (!form || !usr) return;
    if (!form.name.value) form.name.value = usr.name || "";
    if (!form.phone.value) form.phone.value = usr.phone || "";
    if (!form.address.value) form.address.value = usr.address || "";
  }

  function bindFAQ() {
    u.qsa(".faq__q").forEach(function (q) {
      q.addEventListener("click", function () {
        var item = q.closest(".faq__item");
        var open = item.classList.toggle("is-open");
        q.setAttribute("aria-expanded", String(open));
        // CSS-ийн тогтмол max-height урт хариултыг тасалдаг тул бодит өндрийг нь өгнө (transition хэвээр)
        var answer = u.qs(".faq__a", item);
        if (answer) answer.style.maxHeight = open ? answer.scrollHeight + "px" : "";
      });
    });
    // Дэлгэцийн өргөн өөрчлөгдөхөд нээлттэй хариултын өндрийг шинэчилнэ
    window.addEventListener("resize", u.debounce(function () {
      u.qsa(".faq__item.is-open .faq__a").forEach(function (a) {
        a.style.maxHeight = a.scrollHeight + "px";
      });
    }, 150));
  }

  function bindMobileNav() {
    var toggle = u.qs("#nav-toggle");
    var nav = u.qs("#primary-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    u.qsa("a", nav).forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function bindHeaderScroll() {
    var header = u.qs("#site-header");
    if (!header) return;
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 24); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* Холбоо барих утгыг элементэд тавина; утга хоосон бол мөрийг (li) эсвэл холбоосыг нууна */
  function fillContact(sel, value, apply) {
    u.qsa(sel).forEach(function (el) {
      var box = el.closest("li") || el;
      box.hidden = !value;
      if (value) apply(el, value);
    });
  }

  function fillConfigText() {
    var c = PM.CONFIG;
    var k = c.contact;
    u.qsa("[data-brand]").forEach(function (el) { el.textContent = c.brand.name; });
    u.qsa("[data-tagline]").forEach(function (el) { el.textContent = c.brand.tagline; });
    fillContact("[data-phone]", k.phone, function (el, v) {
      el.textContent = v;
      if (el.tagName === "A") el.setAttribute("href", k.phoneHref);
    });
    fillContact("[data-email]", k.email, function (el, v) {
      el.textContent = v;
      if (el.tagName === "A") el.setAttribute("href", "mailto:" + v);
    });
    fillContact("[data-address]", k.address, function (el, v) { el.textContent = v; });
    fillContact("[data-hours]", k.hours, function (el, v) { el.textContent = v; });
    fillContact("[data-delivery-time]", k.deliveryTime, function (el, v) { el.textContent = v; });
    fillContact("[data-messenger]", k.messenger, function (el, v) { el.setAttribute("href", v); });
    fillContact("[data-instagram]", k.instagram, function (el, v) { el.setAttribute("href", v); });
    fillContact("[data-facebook]", k.facebook, function (el, v) { el.setAttribute("href", v); });
    u.qsa("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
    u.qsa("[data-free-over]").forEach(function (el) { el.textContent = u.formatPrice(c.delivery.freeOver); });
  }

  /* Нүүрний статистик (config.stats-аас, value хоосныг алгасна) */
  function renderStats() {
    var el = u.qs("#hero-stats");
    if (!el || !PM.CONFIG.stats) return;
    el.innerHTML = PM.CONFIG.stats.filter(function (s) { return s.value; }).map(function (s) {
      return "<li><b>" + u.escapeHtml(s.value) + "</b><span>" + u.escapeHtml(s.label) + "</span></li>";
    }).join("");
  }

  /* Хэрэглэгчийн сэтгэгдэл (backend-ээс; амжилтгүй бол config fallback) */
  function renderReviews() {
    var el = u.qs("#reviews-grid");
    if (!el) return;
    var tpl = function (r) {
      return '<figure class="review">' +
        '<div class="review__stars" aria-label="5 одтой үнэлгээ">★★★★★</div>' +
        "<blockquote>" + u.escapeHtml(r.text) + "</blockquote>" +
        "<figcaption>— " + u.escapeHtml(r.author) + "</figcaption>" +
      "</figure>";
    };
    var paint = function (list) {
      if (!list || !list.length) list = PM.CONFIG.reviews || [];
      el.innerHTML = list.map(tpl).join("");
    };
    PM.api.get("/reviews").then(function (r) { paint(r.reviews); }).catch(function () { paint(null); });
  }

  /* Хууль эрх зүйн текстийг модалаар нээх */
  function openLegal(key) {
    var doc = PM.CONFIG.legal && PM.CONFIG.legal[key];
    if (!doc) return;
    PM.modal.open(
      '<div class="legal"><h3 class="legal__title">' + u.escapeHtml(doc.title) + "</h3>" +
      '<div class="legal__body">' + doc.body + "</div></div>"
    );
  }

  /* ================================================================== */
  /*  Эхлүүлэх                                                           */
  /* ================================================================== */
  async function init() {
    fillConfigText();
    renderStats();
    renderReviews();
    loadPayConfig();

    // Сагс өөрчлөгдөх бүрд дэлгэц шинэчлэх
    PM.cart.subscribe(PM.ui.renderCart);
    // Хэрэглэгч өөрчлөгдөх бүрд захиалгын форм урьдчилан бөглөх
    PM.session.subscribe(prefillOrderForm);

    // Эвдэрсэн бүтээгдэхүүний зургийг нуух (CSP-д тохирсон, capture фазд)
    document.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.classList.contains("prod-img")) t.style.display = "none";
    }, true);

    // Үйл явдлууд — API хүлээхээс ӨМНӨ холбоно (ачаалж байх хооронд товчнууд ажиллана)
    document.addEventListener("click", onClick);
    bindFilters();
    bindOrderForm();
    bindFAQ();
    bindMobileNav();
    bindHeaderScroll();

    var overlay = u.qs("#overlay");
    if (overlay) overlay.addEventListener("click", function () {
      closeCart(); PM.modal.close(); document.body.classList.remove("nav-open");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeCart(); PM.modal.close();
        document.body.classList.remove("nav-open");
        PM.session.toggleMenu(false);
      }
    });

    // Backend-ээс өгөгдөл ачаалах (барааны алдааг loadCatalog өөрөө харуулна)
    await Promise.all([loadCatalog(), PM.session.load()]);

    // QPay-ийн төлбөрийн хуудаснаас буцаж ирсэн бол төлөвийг шалгана
    handlePaymentReturn();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
