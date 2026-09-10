/**
 * products.js — Бүтээгдэхүүний сан (backend-ээс ачаална)
 * =====================================================================
 * Урьд нь энд бараа шууд бичигдсэн байсан. Одоо бараа болон брэнд нь
 * серверийн өгөгдлийн сангаас ирдэг тул админ самбараас удирдах боломжтой.
 */
window.PM = window.PM || {};

PM.products = (function () {
  "use strict";

  var items = [];
  var brands = [];

  /** Backend-ээс бараа, брэндийг ачаалах */
  async function load() {
    var results = await Promise.all([
      PM.api.get("/products"),
      PM.api.get("/brands").catch(function () { return { brands: [] }; }),
    ]);
    items = results[0].products || [];
    brands = results[1].brands || [];
    return items;
  }

  /** Тухайн бүтээгдэхүүн, хэмжээ (мл)-ийн үнэ */
  function priceOf(product, ml) {
    return product && product.prices && product.prices[ml] != null ? product.prices[ml] : 0;
  }

  /** id-гаар бүтээгдэхүүн олох */
  function getById(id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /** Хамгийн бага үнэ (эрэмбэлэхэд) */
  function minPrice(product) {
    var sizes = PM.CONFIG.sizes, min = Infinity;
    for (var i = 0; i < sizes.length; i++) {
      var p = priceOf(product, sizes[i].ml);
      if (p > 0 && p < min) min = p;
    }
    return min === Infinity ? 0 : min;
  }

  var categories = [
    { key: "all",     label: "Бүгд" },
    { key: "men",     label: "Эрэгтэй" },
    { key: "women",   label: "Эмэгтэй" },
    { key: "unisex",  label: "Унисекс" },
    { key: "popular", label: "Эрэлттэй" },
  ];

  return {
    get items() { return items; },
    get brands() { return brands; },
    categories: categories,
    load: load,
    priceOf: priceOf,
    getById: getById,
    minPrice: minPrice,
  };
})();
