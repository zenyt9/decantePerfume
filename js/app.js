/**
 * app.js — Програмын эхлэл ба үйл явдлын холболт
 * =====================================================================
 * Модулиудыг нэгтгэж, DOM үйл явдлыг сонсоно. Хамгийн сүүлд ачаалагдана.
 *   • Бараа, session-ийг backend-ээс ачаална
 *   • Сагслахын өмнө нэвтрэлт шаардана
 *   • Захиалгыг серверт үүсгэнэ
 */
(function () {
  "use strict";
  var u = PM.utils;

  var filterState = { category: "all", query: "", sort: "featured" };

  /* ================================================================== */
  /*  Каталогийн шүүлт ба эрэмбэлэлт                                     */
  /* ================================================================== */
  function applyFilters() {
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

    PM.ui.renderProducts(list);
    var counter = u.qs("#result-count");
    if (counter) counter.textContent = list.length + " бүтээгдэхүүн";
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
  }
  function closeCart() {
    document.body.classList.remove("cart-open");
    var d = u.qs("#cart-drawer");
    if (d) d.setAttribute("aria-hidden", "true");
    PM.modal.syncOverlay();
  }

  /* ================================================================== */
  /*  Сагслах (нэвтрэлт шаардана)                                        */
  /* ================================================================== */
  function addFromContainer(container) {
    if (!container) return;
    var id = container.getAttribute("data-id");
    var ml = Number(container.getAttribute("data-size"));
    var product = PM.products.getById(id);
    if (!product) return;
    if (PM.products.stockInfo(product).soldOut) {
      u.toast("Уучлаарай, энэ бараа дууссан байна", "error");
      return;
    }

    if (!PM.session.isAuthed()) {
      PM.session.openAuth({
        message: "Сагслахын тулд эхлээд нэвтэрнэ үү.",
        onSuccess: function () { doAdd(product, id, ml); openCart(); },
      });
      return;
    }
    doAdd(product, id, ml);
  }
  function doAdd(product, id, ml) {
    PM.cart.add(id, ml);
    u.toast(product.name + " " + ml + "мл сагслагдлаа", "success");
  }

  /* ================================================================== */
  /*  Захиалга үүсгэх (серверт)                                          */
  /* ================================================================== */
  async function submitOrder(form) {
    var state = PM.cart.state();
    if (state.isEmpty) {
      u.toast("Эхлээд бараа сагслана уу", "error");
      scrollTo("#products");
      return;
    }
    if (!PM.session.isAuthed()) {
      PM.session.openAuth({
        message: "Захиалахын тулд нэвтэрнэ үү.",
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
      u.toast("Нэр, утасны дугаараа бөглөнө үү", "error");
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
      showOrderSuccess(r.order);
    } catch (err) {
      u.toast(err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /** Захиалгыг текстээр (мессенжерт илгээх / хуулах) */
  function orderToText(order) {
    var lines = [];
    lines.push("🛍 " + PM.CONFIG.brand.name + " — Захиалга " + order.code);
    lines.push("————————————————");
    order.items.forEach(function (it, i) {
      lines.push((i + 1) + ". " + it.brand + " " + it.name + " · " + it.ml + "мл × " +
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
        '<h3 class="checkout__title">Захиалга амжилттай!</h3>' +
        '<p class="checkout__lead">Захиалгын дугаар: <b>' + u.escapeHtml(order.code) + "</b><br />" +
          "Бид тун удахгүй холбогдож баталгаажуулна. Захиалгаа “Миний захиалга” хэсгээс хянах боломжтой.</p>" +
        '<pre class="checkout__summary">' + u.escapeHtml(text) + "</pre>" +
        '<div class="checkout__actions">' +
          '<a class="btn btn--solid btn--block" href="' + u.escapeHtml(c.messenger) +
            '" target="_blank" rel="noopener">Мессенжерээр мэдэгдэх</a>' +
          '<button type="button" class="btn btn--text btn--block" data-action="copy-order" ' +
            'data-order="' + encodeURIComponent(text) + '">Захиалгыг хуулах</button>' +
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
      case "add-modal": addFromContainer(actEl.closest(".qv")); PM.modal.close(); break;

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
        u.toast("Сагс хоослогдлоо", "info");
        break;

      case "checkout":
        closeCart();
        scrollTo("#order");
        break;

      case "copy-order": {
        var orderText = decodeURIComponent(actEl.getAttribute("data-order") || "");
        u.copyText(orderText).then(function () { u.toast("Хуулагдлаа", "success"); });
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
    if (search) search.addEventListener("input", u.debounce(function () {
      filterState.query = search.value; applyFilters();
    }, 180));
    var sort = u.qs("#sort");
    if (sort) sort.addEventListener("change", function () {
      filterState.sort = sort.value; applyFilters();
    });
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
      });
    });
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

  function fillConfigText() {
    var c = PM.CONFIG;
    u.qsa("[data-brand]").forEach(function (el) { el.textContent = c.brand.name; });
    u.qsa("[data-tagline]").forEach(function (el) { el.textContent = c.brand.tagline; });
    u.qsa("[data-phone]").forEach(function (el) {
      el.textContent = c.contact.phone;
      if (el.tagName === "A") el.setAttribute("href", c.contact.phoneHref);
    });
    u.qsa("[data-email]").forEach(function (el) {
      el.textContent = c.contact.email;
      if (el.tagName === "A") el.setAttribute("href", "mailto:" + c.contact.email);
    });
    u.qsa("[data-address]").forEach(function (el) { el.textContent = c.contact.address; });
    u.qsa("[data-hours]").forEach(function (el) { el.textContent = c.contact.hours; });
    u.qsa("[data-messenger]").forEach(function (el) { el.setAttribute("href", c.contact.messenger); });
    u.qsa("[data-instagram]").forEach(function (el) { el.setAttribute("href", c.contact.instagram); });
    u.qsa("[data-facebook]").forEach(function (el) { el.setAttribute("href", c.contact.facebook); });
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
        '<div class="review__stars" aria-label="5 од">★★★★★</div>' +
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

    // Сагс өөрчлөгдөх бүрд дэлгэц шинэчлэх
    PM.cart.subscribe(PM.ui.renderCart);
    // Хэрэглэгч өөрчлөгдөх бүрд захиалгын форм урьдчилан бөглөх
    PM.session.subscribe(prefillOrderForm);

    // Backend-ээс өгөгдөл ачаалах
    try {
      await Promise.all([PM.products.load(), PM.session.load()]);
      applyFilters();
    } catch (err) {
      var grid = u.qs("#product-grid");
      if (grid) grid.innerHTML =
        '<p class="load-error">Бараа ачаалахад алдаа гарлаа. Сервер асаалттай эсэхийг шалгана уу.<br />' +
        u.escapeHtml(err.message) + "</p>";
    }

    // Эвдэрсэн бүтээгдэхүүний зургийг нуух (CSP-д тохирсон, capture фазд)
    document.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.classList.contains("prod-img")) t.style.display = "none";
    }, true);

    // Үйл явдлууд
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
