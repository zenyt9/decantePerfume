/**
 * ui.js — Дэлгэцэнд зурах (render) давхарга
 * =====================================================================
 * DOM-д HTML үүсгэх бүх функц энд байрлана. Логик (cart, products)-оос
 * тусгаарласан тул засаж, өргөтгөхөд амар.
 */
window.PM = window.PM || {};

PM.ui = (function () {
  "use strict";

  var u = PM.utils;
  var esc = u.escapeHtml;
  var fmt = u.formatPrice;

  /* ------------------------------------------------------------------ */
  /*  Флакон (SVG зураг) — бодит зураг байхгүй үед өнгөт лонх зурна       */
  /* ------------------------------------------------------------------ */
  function bottleSVG(product) {
    var c = esc(product.accent);
    var initial = esc(product.brand.charAt(0).toUpperCase());
    var gid = "grad-" + esc(product.id);
    return (
      '<svg class="bottle" viewBox="0 0 120 170" role="img" aria-label="' +
        esc(product.brand + " " + product.name) + '">' +
        "<defs>" +
          '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="' + c + '" stop-opacity="0.92"/>' +
            '<stop offset="1" stop-color="' + c + '" stop-opacity="1"/>' +
          "</linearGradient>" +
        "</defs>" +
        // таг
        '<rect x="48" y="6" width="24" height="18" rx="3" fill="' + c + '"/>' +
        // хүзүү
        '<rect x="52" y="22" width="16" height="12" fill="' + c + '" opacity="0.85"/>' +
        // их бие
        '<rect x="26" y="32" width="68" height="126" rx="14" fill="url(#' + gid + ')"/>' +
        // гэрлийн тусгал
        '<rect x="34" y="42" width="14" height="80" rx="7" fill="#ffffff" opacity="0.18"/>' +
        // брэндийн үсэг
        '<text x="60" y="110" text-anchor="middle" font-family="Georgia, serif" ' +
          'font-size="46" fill="#ffffff" opacity="0.9">' + initial + "</text>" +
        // шошго шугам
        '<rect x="26" y="124" width="68" height="1.5" fill="#ffffff" opacity="0.35"/>' +
      "</svg>"
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Хэмжээ сонгогч (5 / 10 / 20 мл товчнууд)                            */
  /* ------------------------------------------------------------------ */
  function sizeChips(product, selectedMl) {
    return PM.CONFIG.sizes.map(function (s) {
      var active = s.ml === selectedMl ? " is-active" : "";
      return (
        '<button type="button" class="size-chip' + active + '" ' +
          'data-size="' + s.ml + '" ' +
          'aria-pressed="' + (s.ml === selectedMl) + '">' +
          esc(s.label) +
        "</button>"
      );
    }).join("");
  }

  /* ------------------------------------------------------------------ */
  /*  Бүтээгдэхүүний карт                                                 */
  /* ------------------------------------------------------------------ */
  function genderLabel(g) {
    return g === "men" ? "Эрэгтэй" : g === "women" ? "Эмэгтэй" : "Унисекс";
  }

  function productCard(product) {
    var sel = PM.CONFIG.defaultSize;
    var price = PM.products.priceOf(product, sel);
    var badge = product.popular
      ? '<span class="card__badge">Эрэлттэй</span>' : "";

    return (
      '<article class="card" data-id="' + esc(product.id) + '" data-size="' + sel + '">' +
        '<div class="card__media" style="--accent:' + esc(product.accent) + '">' +
          badge +
          bottleSVG(product) +
          '<button type="button" class="card__quickview" data-action="quickview" ' +
            'aria-label="Дэлгэрэнгүй харах">Дэлгэрэнгүй</button>' +
        "</div>" +
        '<div class="card__body">' +
          '<p class="card__brand">' + esc(product.brand) +
            ' · <span class="card__gender">' + genderLabel(product.gender) + "</span></p>" +
          '<h3 class="card__name">' + esc(product.name) + "</h3>" +
          '<p class="card__notes">' + esc(topNotesLine(product)) + "</p>" +
          '<div class="card__sizes" role="group" aria-label="Хэмжээ сонгох">' +
            sizeChips(product, sel) +
          "</div>" +
          '<div class="card__foot">' +
            '<span class="card__price" data-role="price">' + fmt(price) + "</span>" +
            '<button type="button" class="btn btn--solid card__add" data-action="add">' +
              "Сагслах" +
            "</button>" +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function topNotesLine(product) {
    // Дээд болон зүрхэн нотоос товч мөр гаргана
    var arr = (product.notes.top || []).concat(product.notes.heart || []);
    return arr.slice(0, 3).join(" · ");
  }

  /* ------------------------------------------------------------------ */
  /*  Каталог зурах                                                      */
  /* ------------------------------------------------------------------ */
  function renderProducts(list) {
    var grid = u.qs("#product-grid");
    var empty = u.qs("#product-empty");
    if (!grid) return;

    if (!list.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = list.map(productCard).join("");
  }

  /* ------------------------------------------------------------------ */
  /*  Сагс (drawer) зурах                                                */
  /* ------------------------------------------------------------------ */
  function cartLineHTML(li) {
    var p = li.product;
    return (
      '<li class="cart-line" data-id="' + esc(li.id) + '" data-size="' + li.ml + '">' +
        '<div class="cart-line__thumb" style="--accent:' + esc(p.accent) + '">' +
          bottleSVG(p) +
        "</div>" +
        '<div class="cart-line__info">' +
          '<p class="cart-line__name">' + esc(p.name) +
            ' <span class="cart-line__size">' + li.ml + " мл</span></p>" +
          '<p class="cart-line__brand">' + esc(p.brand) + "</p>" +
          '<div class="qty" role="group" aria-label="Тоо ширхэг">' +
            '<button type="button" class="qty__btn" data-action="dec" aria-label="Хасах">−</button>' +
            '<span class="qty__val">' + li.qty + "</span>" +
            '<button type="button" class="qty__btn" data-action="inc" aria-label="Нэмэх">+</button>' +
          "</div>" +
        "</div>" +
        '<div class="cart-line__right">' +
          '<span class="cart-line__total">' + fmt(li.lineTotal) + "</span>" +
          '<button type="button" class="cart-line__remove" data-action="remove" ' +
            'aria-label="Устгах">Устгах</button>' +
        "</div>" +
      "</li>"
    );
  }

  function renderCart(state) {
    var body = u.qs("#cart-body");
    var footer = u.qs("#cart-footer");
    var badge = u.qs("#cart-count");
    var headCount = u.qs("#cart-head-count");

    // Толгойн тоолуур
    if (badge) {
      badge.textContent = state.count;
      badge.hidden = state.count === 0;
    }
    if (headCount) {
      headCount.textContent = state.count
        ? state.count + " бараа" : "Хоосон байна";
    }

    if (!body) return;

    if (state.isEmpty) {
      body.innerHTML =
        '<div class="cart-empty">' +
          '<div class="cart-empty__icon" aria-hidden="true"></div>' +
          "<p>Таны сагс хоосон байна.</p>" +
          '<button type="button" class="btn btn--outline" data-action="close-cart">' +
            "Дэлгүүр үзэх" +
          "</button>" +
        "</div>";
      if (footer) footer.hidden = true;
      return;
    }

    body.innerHTML =
      '<ul class="cart-lines">' +
        state.lineItems.map(cartLineHTML).join("") +
      "</ul>";

    if (footer) {
      footer.hidden = false;
      var freeOver = PM.CONFIG.delivery.freeOver;
      var remain = freeOver - state.subtotal;
      var deliveryText = state.deliveryFee === 0
        ? '<span class="ship-free">Үнэгүй</span>'
        : fmt(state.deliveryFee);
      var hint = remain > 0
        ? '<p class="cart-hint">' + fmt(remain) +
          " нэмж авбал хүргэлт <b>үнэгүй</b>.</p>"
        : '<p class="cart-hint cart-hint--ok">Хүргэлт үнэгүй боллоо 🎉</p>';

      footer.innerHTML =
        hint +
        '<div class="cart-sum">' +
          '<div class="cart-sum__row"><span>Барааны дүн</span><span>' +
            fmt(state.subtotal) + "</span></div>" +
          '<div class="cart-sum__row"><span>Хүргэлт</span><span>' +
            deliveryText + "</span></div>" +
          '<div class="cart-sum__row cart-sum__row--total"><span>Нийт</span><span>' +
            fmt(state.total) + "</span></div>" +
        "</div>" +
        '<button type="button" class="btn btn--solid btn--block" data-action="checkout">' +
          "Захиалга өгөх" +
        "</button>" +
        '<button type="button" class="btn btn--text btn--block" data-action="clear-cart">' +
          "Сагс хоослох" +
        "</button>";
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Дэлгэрэнгүй цонх (quick view modal)                                */
  /* ------------------------------------------------------------------ */
  function noteRow(title, arr) {
    if (!arr || !arr.length) return "";
    return (
      '<div class="note-row">' +
        '<span class="note-row__title">' + esc(title) + "</span>" +
        '<span class="note-row__items">' + esc(arr.join(", ")) + "</span>" +
      "</div>"
    );
  }

  function renderQuickView(product) {
    var sel = PM.CONFIG.defaultSize;
    var price = PM.products.priceOf(product, sel);

    var html =
      '<div class="qv" data-id="' + esc(product.id) + '" data-size="' + sel + '">' +
        '<div class="qv__media" style="--accent:' + esc(product.accent) + '">' +
          bottleSVG(product) +
        "</div>" +
        '<div class="qv__body">' +
          '<p class="qv__brand">' + esc(product.brand) + " · " +
            genderLabel(product.gender) +
            (product.year ? " · " + product.year : "") + "</p>" +
          '<h3 class="qv__name">' + esc(product.name) + "</h3>" +
          '<p class="qv__desc">' + esc(product.description) + "</p>" +
          '<div class="qv__notes">' +
            noteRow("Дээд нот", product.notes.top) +
            noteRow("Зүрхэн нот", product.notes.heart) +
            noteRow("Суурь нот", product.notes.base) +
          "</div>" +
          '<div class="qv__sizes" role="group" aria-label="Хэмжээ сонгох">' +
            sizeChips(product, sel) +
          "</div>" +
          '<div class="qv__foot">' +
            '<span class="qv__price" data-role="price">' + fmt(price) + "</span>" +
            '<button type="button" class="btn btn--solid" data-action="add-modal">' +
              "Сагслах" +
            "</button>" +
          "</div>" +
        "</div>" +
      "</div>";
    PM.modal.open(html, { wide: true });
  }

  /* ------------------------------------------------------------------ */
  /*  Захиалгын текст (мессенжер / хуулахад бэлэн)                        */
  /* ------------------------------------------------------------------ */
  function buildOrderText(form) {
    var state = PM.cart.state();
    var lines = [];
    lines.push("🛍 " + PM.CONFIG.brand.name + " — Шинэ захиалга");
    lines.push("————————————————");
    state.lineItems.forEach(function (li, i) {
      lines.push(
        (i + 1) + ". " + li.product.brand + " " + li.product.name +
        " · " + li.ml + "мл × " + li.qty + " = " + fmt(li.lineTotal)
      );
    });
    lines.push("————————————————");
    lines.push("Барааны дүн: " + fmt(state.subtotal));
    lines.push("Хүргэлт: " + (state.deliveryFee === 0 ? "Үнэгүй" : fmt(state.deliveryFee)));
    lines.push("Нийт төлөх: " + fmt(state.total));
    if (form) {
      lines.push("————————————————");
      if (form.name)    lines.push("Нэр: " + form.name);
      if (form.phone)   lines.push("Утас: " + form.phone);
      if (form.address) lines.push("Хаяг: " + form.address);
      if (form.note)    lines.push("Тэмдэглэл: " + form.note);
    }
    return lines.join("\n");
  }

  /* ------------------------------------------------------------------ */
/*  Захиалгын туслахууд (профайл болон админд нийтлэг)                  */
  /* ------------------------------------------------------------------ */
  var STATUS = {
    new:        { label: "Шинэ",          cls: "st-new" },
    confirmed:  { label: "Баталгаажсан",  cls: "st-confirmed" },
    delivering: { label: "Хүргэлтэд",     cls: "st-delivering" },
    done:       { label: "Дууссан",       cls: "st-done" },
    cancelled:  { label: "Цуцлагдсан",    cls: "st-cancelled" },
  };

  function statusInfo(status) {
    return STATUS[status] || { label: status, cls: "" };
  }

  function statusBadge(status) {
    var s = statusInfo(status);
    return '<span class="status ' + s.cls + '">' + esc(s.label) + "</span>";
  }

  function formatDate(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /** Захиалгын мөрүүдийг богино текстээр */
  function orderItemsLine(order) {
    return order.items.map(function (it) {
      return it.brand + " " + it.name + " · " + it.ml + "мл × " + it.qty;
    }).join("<br />");
  }

  return {
    bottleSVG: bottleSVG,
    renderProducts: renderProducts,
    renderCart: renderCart,
    renderQuickView: renderQuickView,
    buildOrderText: buildOrderText,
    genderLabel: genderLabel,
    statusInfo: statusInfo,
    statusBadge: statusBadge,
    formatDate: formatDate,
    orderItemsLine: orderItemsLine,
  };
})();

/* ==================================================================== */
/*  PM.modal — Ерөнхий modal удирдлага                                  */
/*  (quick-view, нэвтрэлт, профайл, захиалгын түүх бүгд үүнийг ашиглана) */
/* ==================================================================== */
PM.modal = (function () {
  "use strict";
  var u = PM.utils;

  function overlay() { return u.qs("#overlay"); }
  function modalEl() { return u.qs("#modal"); }

  /** Cart эсвэл modal аль нэг нь нээлттэй бол overlay-г харуулна */
  function syncOverlay() {
    var open = document.body.classList.contains("cart-open") || isOpen();
    var ov = overlay();
    if (ov) ov.classList.toggle("is-visible", open);
  }

  function isOpen() {
    var m = modalEl();
    return m && m.getAttribute("aria-hidden") === "false";
  }

  /** HTML агуулгыг modal-д дүрсэлж нээх. wide=true бол өргөн хувилбар. */
  function open(html, opts) {
    opts = opts || {};
    var host = u.qs("#modal-content");
    var panel = u.qs("#modal .modal__panel");
    if (host) host.innerHTML = html;
    if (panel) panel.classList.toggle("modal__panel--wide", !!opts.wide);
    var m = modalEl();
    if (m) m.setAttribute("aria-hidden", "false");
    syncOverlay();
  }

  function close() {
    var m = modalEl();
    if (m) m.setAttribute("aria-hidden", "true");
    syncOverlay();
  }

  return { open: open, close: close, isOpen: isOpen, syncOverlay: syncOverlay };
})();
