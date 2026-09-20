/**
 * lib/db.js — Энгийн JSON өгөгдлийн сан
 * =====================================================================
 * Бүх өгөгдлийг data/db.json файлд хадгална. Санг санах ойд ачаалж,
 * өөрчлөлт бүрд файлруу аюулгүй (atomic) бичнэ. Жижиг дэлгүүрт хангалттай.
 *
 * Хожим PostgreSQL/MongoDB руу шилжих бол зөвхөн энэ модулийг солиход
 * болно — бусад код нь read/write функцуудыг л дууддаг.
 */
"use strict";
const fs = require("fs");
const path = require("path");

// DATA_DIR-ийг орчны хувьсагчаар дарж болно (Railway дээр Volume-ийн зам).
// Тохируулаагүй бол төслийн доторх data/ фолдерийг ашиглана.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const TMP_FILE = path.join(DATA_DIR, "db.tmp.json");

// Автомат snapshot backup (эвдрэл, санамсаргүй бөөн устгалаас сэргээх).
// Volume дээр хадгална — цагт 1 удаа, сүүлийн BACKUP_KEEP ширхгийг үлдээнэ.
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BACKUP_KEEP = 48;                       // ≈2 хоногийн цаг тутмын хувилбар
const BACKUP_MIN_INTERVAL = 60 * 60 * 1000;   // 1 цаг
let lastBackup = 0;

let state = null;

/** Хоосон бүтэц */
function emptyState() {
  return { users: [], sessions: [], brands: [], products: [], orders: [], reviews: [], meta: { seeded: false } };
}

/** Сан ачаалах (эсвэл шинээр үүсгэх) */
function load() {
  if (state) return state;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      state = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      // Дутуу талбарууд байвал нөхөх
      const base = emptyState();
      for (const k in base) if (!(k in state)) state[k] = base[k];
    } else {
      state = emptyState();
      save();
    }
  } catch (e) {
    console.error("DB ачаалах алдаа:", e.message);
    state = emptyState();
  }
  return state;
}

/** Санг файлруу бичих (atomic: түр файл → rename) */
function save() {
  if (!state) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP_FILE, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(TMP_FILE, DB_FILE);
    backup();
  } catch (e) {
    console.error("DB хадгалах алдаа:", e.message);
  }
}

/** Хугацаат snapshot backup — эвдрэл/буруу засвараас сэргээх боломж.
    save() бүрээс дуудагдана, гэвч цагт нэгээс илүүгүй бичнэ. */
function backup(force) {
  try {
    const now = Date.now();
    if (!force && now - lastBackup < BACKUP_MIN_INTERVAL) return;
    lastBackup = now;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(BACKUP_DIR, "db-" + stamp + ".json"),
      JSON.stringify(state, null, 2), "utf8");
    // Хуучин backup-уудыг цэвэрлэх (сүүлийн BACKUP_KEEP-ийг үлдээх)
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.indexOf("db-") === 0 && f.slice(-5) === ".json")
      .sort();
    while (files.length > BACKUP_KEEP) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (e) {}
    }
  } catch (e) {
    console.error("Backup алдаа:", e.message);
  }
}

/** Тухайн цуглуулгыг (массив) авах */
function table(name) {
  return load()[name];
}

/** id-гаар нэг мөр олох */
function find(name, id) {
  return table(name).find((row) => row.id === id) || null;
}

/** Нөхцөлөөр олох */
function findBy(name, predicate) {
  return table(name).find(predicate) || null;
}

/** Шүүх */
function filter(name, predicate) {
  return table(name).filter(predicate);
}

/** Мөр нэмэх */
function insert(name, row) {
  table(name).push(row);
  save();
  return row;
}

/** id-гаар шинэчлэх (патч) */
function update(name, id, patch) {
  const row = find(name, id);
  if (!row) return null;
  Object.assign(row, patch);
  save();
  return row;
}

/** id-гаар устгах */
function remove(name, id) {
  const arr = table(name);
  const idx = arr.findIndex((row) => row.id === id);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  save();
  return true;
}

module.exports = {
  load,
  save,
  table,
  find,
  findBy,
  filter,
  insert,
  update,
  remove,
  DB_FILE,
};
