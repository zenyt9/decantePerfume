/**
 * cart.js — Сагсны логик
 * =====================================================================
 * Сагсны төлөвийг хадгалж, localStorage-д тогтмолжуулж, өөрчлөлт болох
 * бүрд бүртгүүлсэн (subscribe) функцуудад мэдэгдэнэ.
 *
 * Нэг мөр (line) = { id, ml, qty }. Дэлгэцэнд харуулахдаа бүтээгдэхүүн,
 * үнэтэй нь нэгтгэж lineItems()-оор авна.
 */
window.PM = window.PM || {};

PM.cart = (function () {
  "use strict";

  var STORAGE_KEY = "pm_cart_v1";
  var items = PM.utils.storage.get(STORAGE_KEY, []); // [{ id, ml, qty }]
  var listeners = [];

  /* ---- Дотоод туслахууд ---- */

  function persist() {
    PM.utils.storage.set(STORAGE_KEY, items);
    emit();
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i](publicState());
  }

  function findIndex(id, ml) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id && items[i].ml === ml) return i;
    }
    return -1;
  }

  /* ---- Нийтэд нээлттэй үйлдлүүд ---- */

  /** Сагсанд нэмэх (байвал тоог нэмнэ) */
  function add(id, ml, qty) {
    qty = qty || 1;
    var idx = findIndex(id, ml);
    if (idx > -1) {
      items[idx].qty += qty;
    } else {
      items.push({ id: id, ml: ml, qty: qty });
    }
    persist();
  }

  /** Тодорхой мөрийн тоо ширхэгийг шинэчлэх (0 бол хасна) */
  function setQty(id, ml, qty) {
    var idx = findIndex(id, ml);
    if (idx === -1) return;
    if (qty <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx].qty = qty;
    }
    persist();
  }

  /** Мөрийг устгах */
  function remove(id, ml) {
    var idx = findIndex(id, ml);
    if (idx > -1) {
      items.splice(idx, 1);
      persist();
    }
  }

  /** Сагсыг бүрэн хоослох */
  function clear() {
    items = [];
    persist();
  }

  /** Нийт тоо ширхэг (badge дээр харагдана) */
  function count() {
    return items.reduce(function (sum, it) { return sum + it.qty; }, 0);
  }

  /** Бүтээгдэхүүн болон үнэтэй нь нэгтгэсэн дэлгэрэнгүй мөрүүд */
  function lineItems() {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var product = PM.products.getById(it.id);
      if (!product) continue; // каталогоос устсан бол алгасна
      var unit = PM.products.priceOf(product, it.ml);
      out.push({
        id: it.id,
        ml: it.ml,
        qty: it.qty,
        product: product,
        unitPrice: unit,
        lineTotal: unit * it.qty,
      });
    }
    return out;
  }

  /** Бараануудын нийт дүн (хүргэлтгүй) */
  function subtotal() {
    return lineItems().reduce(function (sum, li) { return sum + li.lineTotal; }, 0);
  }

  /** Хүргэлтийн төлбөр (үнэгүй болзол шалгана) */
  function deliveryFee() {
    var d = PM.CONFIG.delivery;
    var sub = subtotal();
    if (sub <= 0) return 0;
    return sub >= d.freeOver ? 0 : d.fee;
  }

  /** Нийт төлөх дүн */
  function total() {
    return subtotal() + deliveryFee();
  }

  function isEmpty() {
    return items.length === 0;
  }

  /** Дэлгэцэнд өгөх төлөв */
  function publicState() {
    return {
      lineItems: lineItems(),
      count: count(),
      subtotal: subtotal(),
      deliveryFee: deliveryFee(),
      total: total(),
      isEmpty: isEmpty(),
    };
  }

  /** Өөрчлөлтөд бүртгүүлэх. Бүртгэлийг цуцлах функц буцаана. */
  function subscribe(fn) {
    listeners.push(fn);
    fn(publicState()); // эхний төлөвийг шууд өгнө
    return function unsubscribe() {
      var i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  return {
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    count: count,
    subscribe: subscribe,
    state: publicState,
  };
})();
