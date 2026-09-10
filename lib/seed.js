/**
 * lib/seed.js — Анхны өгөгдөл суулгах
 * =====================================================================
 * Сан хоосон үед нэг удаа ажиллаж, брэнд, бүтээгдэхүүн болон
 * анхны админ хэрэглэгчийг үүсгэнэ.
 *
 *  ⚠️ АНХААР: Анхны админ нэвтрэх мэдээллийг эхний ажиллуулалтын дараа
 *  заавал өөрчилнө үү (доорхи DEFAULT_ADMIN).
 */
"use strict";
const db = require("./db");
const auth = require("./auth");
const { genId } = require("./util");

/* Анхны админ — эхний ажиллуулалтад үүснэ.
   Production дээр ADMIN_EMAIL, ADMIN_PASSWORD орчны хувьсагчаар дарж,
   код засалгүйгээр хүчтэй нууц үг тавьж болно. */
const DEFAULT_ADMIN = {
  name: "Админ",
  email: process.env.ADMIN_EMAIL || "admin@decante.mn",
  password: process.env.ADMIN_PASSWORD || "Admin@123", // ← эхний нэвтрэлтийн дараа солино
};

/* Үнийн шатлал (₮) — seed хийхэд ашиглана */
const TIERS = {
  designer: { 5: 14000, 10: 25000, 20: 45000 },
  premium:  { 5: 19000, 10: 34000, 20: 62000 },
  niche:    { 5: 32000, 10: 58000, 20: 105000 },
};

/* Каталогийн анхны бүтээгдэхүүн (tier-ээс үнэ тооцно) */
const SEED_PRODUCTS = [
  { name: "Sauvage", brand: "Dior", gender: "men", tier: "designer", accent: "#5b7c99", year: 2015, popular: true,
    notes: { top: ["Бергамот", "Калабрын жүрж"], heart: ["Сычуань чинжүү", "Лаванда", "Гераниум"], base: ["Амброксан", "Хуш мод", "Лабданум"] },
    description: "Цэвэр, эрч хүчтэй. Цитрусын шинэлэг эхлэл амброксаны дулаан сүүлээр төгсдөг өдөр тутмын сонгодог үнэр." },
  { name: "Bleu de Chanel", brand: "Chanel", gender: "men", tier: "premium", accent: "#2f4356", year: 2010, popular: true,
    notes: { top: ["Грейпфрут", "Нимбэг", "Гаа"], heart: ["Хужир самар", "Имбирь", "Жасмин"], base: ["Гүн утлага", "Сандал мод", "Хув"] },
    description: "Хэмжээ мэдсэн эрэгтэй сонгодог. Ажил, оройн үдэшлэг аль алинд зохицдог тансаг мод-цитрусын хослол." },
  { name: "Aventus", brand: "Creed", gender: "men", tier: "niche", accent: "#3a5a40", year: 2010, popular: true,
    notes: { top: ["Хан боргоцой", "Бергамот", "Алим"], heart: ["Сарнай", "Хусны мод", "Ясмин"], base: ["Миск", "Царс хөвд", "Ваниль"] },
    description: "Ниш ертөнцийн домог. Утаат хусны мод, амтат хан боргоцойн онцгой хослол өөрийгөө итгэлтэй илэрхийлнэ." },
  { name: "Le Male", brand: "Jean Paul Gaultier", gender: "men", tier: "designer", accent: "#4a6fa5", year: 1995, popular: false,
    notes: { top: ["Мята", "Лаванда", "Бергамот"], heart: ["Шанц", "Гаа", "Улаан лооль цэцэг"], base: ["Ваниль", "Тонка", "Хув"] },
    description: "Дулаан, амтлаг, танигдах. Мята-лавандагийн сэрүүн эхлэл ваниль-тонкагийн наалдам сүүлтэй хослоно." },
  { name: "Eros", brand: "Versace", gender: "men", tier: "designer", accent: "#1e5f74", year: 2012, popular: false,
    notes: { top: ["Мята", "Ногоон алим", "Нимбэг"], heart: ["Тонка", "Гераниум", "Амброксан"], base: ["Ваниль", "Хуш мод", "Царс хөвд"] },
    description: "Залуу, тоглоомтой эрч хүч. Ногоон алим-мятагийн сэрүүн амт ваниль-тонкагийн чихэрлэг дулаанд уусна." },
  { name: "Libre", brand: "Yves Saint Laurent", gender: "women", tier: "premium", accent: "#b5838d", year: 2019, popular: true,
    notes: { top: ["Мандарин", "Бергамот", "Лаванда"], heart: ["Улбар шар цэцэг", "Жасмин", "Лаванда"], base: ["Ваниль", "Миск", "Хув"] },
    description: "Эрх чөлөөний үнэр. Лавандагийн сэрүүн шинэлэг, цэцэг-ванилийн эмэгтэйлэг дулаан хоёрын зоримог хослол." },
  { name: "La Vie Est Belle", brand: "Lancôme", gender: "women", tier: "premium", accent: "#d88c9a", year: 2012, popular: true,
    notes: { top: ["Лийр", "Үхрийн нүд", "Ирис"], heart: ["Ирис", "Жасмин", "Улбар шар цэцэг"], base: ["Пралине", "Ваниль", "Пачули"] },
    description: "“Амьдрал сайхан”. Ирис-пралинегийн чихэрлэг гурманд үнэр аз жаргалтай, дулаахан сэтгэгдэл үлдээнэ." },
  { name: "Good Girl", brand: "Carolina Herrera", gender: "women", tier: "premium", accent: "#34344a", year: 2016, popular: false,
    notes: { top: ["Бүйлс", "Кофе", "Нимбэг"], heart: ["Туберза", "Жасмин самбак", "Дал"], base: ["Тонка", "Какао", "Ваниль"] },
    description: "Гоёмсог, зоримог. Кофе-бүйлсний хар шоколадан гүн үнэр оройн үдэшлэгт өөрийгөө онцолно." },
  { name: "Coco Mademoiselle", brand: "Chanel", gender: "women", tier: "premium", accent: "#c98a7d", year: 2001, popular: false,
    notes: { top: ["Жүрж", "Бергамот", "Грейпфрут"], heart: ["Сарнай", "Жасмин", "Личи"], base: ["Пачули", "Ветивер", "Ак миск"] },
    description: "Мөнхийн эмэгтэйлэг сонгодог. Цитрус-сарнайн цэвэр, пачулийн гүн сүүлтэй эрхэмсэг хослол." },
  { name: "Baccarat Rouge 540", brand: "Maison Francis Kurkdjian", gender: "unisex", tier: "niche", accent: "#9b2226", year: 2015, popular: true,
    notes: { top: ["Гүргэм", "Жасмин"], heart: ["Амбер мод", "Гацуурын давирхай"], base: ["Амбра", "Хуш мод"] },
    description: "Орчин үеийн шүтээн үнэр. Гүргэм-амбер модны чихэрлэг, эрдэс шинжтэй ялгаралт удаан хугацаанд тогтоно." },
  { name: "Tobacco Vanille", brand: "Tom Ford", gender: "unisex", tier: "niche", accent: "#7f5539", year: 2007, popular: false,
    notes: { top: ["Тамхины навч", "Халуун ногоо"], heart: ["Ваниль", "Какао", "Тонка"], base: ["Хатаасан жимс", "Мод"] },
    description: "Өвлийн тансаг дулаан. Тамхи-ванилийн наалдам, амтат утаат хослол хүйтэн улиралд төгс тохирно." },
  { name: "1 Million", brand: "Paco Rabanne", gender: "men", tier: "designer", accent: "#bf9b30", year: 2008, popular: false,
    notes: { top: ["Грейпфрут", "Мята", "Мандарин"], heart: ["Сарнай", "Шанц", "Халуун ногоо"], base: ["Арьс", "Хув", "Ак мод"] },
    description: "Алт шиг гялалзсан зоримог үнэр. Цитрус-шанцны халуун амт арьс-хувийн тансаг сүүлтэй хослоно." },

  /* ---- Эрэгтэй топ 10 (нэмэлт) ---- */
  { name: "Acqua di Giò", brand: "Giorgio Armani", gender: "men", tier: "designer", accent: "#3f7fa0", year: 1996, popular: true,
    notes: { top: ["Далайн тэмдэглэл", "Бергамот", "Нероли"], heart: ["Жасмин", "Розмарин", "Тор жимс"], base: ["Пачули", "Хуш мод", "Ак миск"] },
    description: "Далайн шинэлэг сонгодог. Цэнгэг цитрус, усны нот өдрийн турш сэрүүн, цэвэрхэн мэдрэмж өгнө." },
  { name: "Homme Intense", brand: "Dior", gender: "men", tier: "premium", accent: "#574a6b", year: 2011, popular: false,
    notes: { top: ["Лаванда"], heart: ["Ирис", "Амбрет"], base: ["Ветивер", "Хуш мод", "Какао"] },
    description: "Гоёмсог, нунтаг ирисэн үнэр. Ветивер-какаогийн гүн сүүл оройн үдэшлэгт эрхэмсэг байдлыг нэмнэ." },
  { name: "La Nuit de L'Homme", brand: "Yves Saint Laurent", gender: "men", tier: "designer", accent: "#34435c", year: 2009, popular: true,
    notes: { top: ["Кардамон"], heart: ["Лаванда", "Бергамот", "Гаа"], base: ["Хуш мод", "Ветивер", "Кумарин"] },
    description: "Романтик, зөөлөн эрч хүч. Кардамон-хушны дулаахан хослол шөнийн болзоонд төгс тохирно." },
  { name: "The One for Men", brand: "Dolce & Gabbana", gender: "men", tier: "designer", accent: "#7a5a34", year: 2008, popular: false,
    notes: { top: ["Грейпфрут", "Кориандр", "Базилик"], heart: ["Гаа", "Имбирь", "Улаан лооль цэцэг"], base: ["Тамхи", "Хув", "Хуш мод"] },
    description: "Дулаан, амтлаг тамхи-хувийн үнэр. Ажлын өдрөөс оройн үдэшлэг хүртэл зохицсон эрхэмсэг сонголт." },
  { name: "The Most Wanted", brand: "Azzaro", gender: "men", tier: "designer", accent: "#5e3f28", year: 2021, popular: true,
    notes: { top: ["Кардамон"], heart: ["Кофе", "Ток"], base: ["Ваниль", "Хув", "Ак мод"] },
    description: "Орчин үеийн трэнд. Кофе-кардамоны амтат, дулаан хослол хүчтэй, удаан тогтоно." },
  { name: "L'Homme", brand: "Prada", gender: "men", tier: "premium", accent: "#7e858c", year: 2016, popular: false,
    notes: { top: ["Нероли", "Хар чинжүү"], heart: ["Ирис", "Гераниум"], base: ["Пачули", "Хуш мод", "Хув"] },
    description: "Цэвэрхэн, нунтаг гоо сайхан. Ирис-нероли зөөлөн, соёлч төрхийг илэрхийлдэг." },
  { name: "Armani Code", brand: "Giorgio Armani", gender: "men", tier: "designer", accent: "#26242b", year: 2004, popular: false,
    notes: { top: ["Бергамот", "Нимбэг"], heart: ["Улбар шар цэцэг", "Гуайак мод"], base: ["Тонка", "Тамхи", "Арьс"] },
    description: "Уран сэтгэмжит оройн үнэр. Тонка-тамхины дулаан, арьсан сүүл нууцлаг сэтгэгдэл төрүүлнэ." },
  { name: "Legend", brand: "Montblanc", gender: "men", tier: "designer", accent: "#37596b", year: 2011, popular: false,
    notes: { top: ["Бергамот", "Лаванда", "Вербена"], heart: ["Сарнай", "Алим", "Гераниум"], base: ["Сандал мод", "Тонка", "Царс хөвд"] },
    description: "Сонгодог фужер. Лаванда-сандал модны цэвэрхэн, эрэгтэйлэг хослол өдөр тутамд тохиромжтой." },
  { name: "Boss Bottled", brand: "Hugo Boss", gender: "men", tier: "designer", accent: "#6a5a3a", year: 1998, popular: true,
    notes: { top: ["Алим", "Бергамот", "Нимбэг"], heart: ["Шанц", "Гвоздик", "Гераниум"], base: ["Сандал мод", "Хуш мод", "Ветивер"] },
    description: "Ажил хэрэгч эрэгтэйн сонгодог. Алим-шанцны дулаахан мод үнэр өдөр бүрт итгэл төгс байдлыг нэмнэ." },
  { name: "Uomo Born in Roma", brand: "Valentino", gender: "men", tier: "premium", accent: "#2b2b3d", year: 2019, popular: false,
    notes: { top: ["Имбирь", "Бергамот"], heart: ["Ветивер", "Далайн давс"], base: ["Мод", "Ваниль", "Хув"] },
    description: "Орчин үеийн эрдэс-модон үнэр. Далайн давс, ваниль модны хослол хот суурины залуу төрхийг илэрхийлнэ." },
];

/** Сан хоосон бол анхны өгөгдлийг суулгах */
function ensureSeeded() {
  db.load();
  if (db.load().meta.seeded) return;

  // 1) Брэндүүд (давхардалгүй)
  const brandNames = [];
  SEED_PRODUCTS.forEach((p) => { if (brandNames.indexOf(p.brand) === -1) brandNames.push(p.brand); });
  const brandByName = {};
  brandNames.forEach((name) => {
    const b = { id: genId("brand"), name: name, createdAt: Date.now() };
    db.insert("brands", b);
    brandByName[name] = b.id;
  });

  // 2) Бүтээгдэхүүн (tier → үнэ)
  SEED_PRODUCTS.forEach((p) => {
    const tier = TIERS[p.tier] || TIERS.designer;
    db.insert("products", {
      id: genId("prod"),
      name: p.name,
      brand: p.brand,
      brandId: brandByName[p.brand] || null,
      gender: p.gender,
      accent: p.accent,
      year: p.year,
      popular: !!p.popular,
      notes: p.notes,
      description: p.description,
      prices: { 5: tier[5], 10: tier[10], 20: tier[20] },
      active: true,
      createdAt: Date.now(),
    });
  });

  // 3) Анхны админ
  db.insert("users", {
    id: genId("user"),
    name: DEFAULT_ADMIN.name,
    email: DEFAULT_ADMIN.email.toLowerCase(),
    phone: "",
    address: "",
    passwordHash: auth.hashPassword(DEFAULT_ADMIN.password),
    role: "admin",
    createdAt: Date.now(),
  });

  db.load().meta.seeded = true;
  db.save();

  console.log("✔ Анхны өгөгдөл суулгалаа.");
  console.log("  Админ нэвтрэх:", DEFAULT_ADMIN.email, "/", DEFAULT_ADMIN.password);
  console.log("  (Эхний нэвтрэлтийн дараа нууц үгээ солино уу.)");
}

module.exports = { ensureSeeded, TIERS };
