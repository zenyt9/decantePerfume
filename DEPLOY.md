# 🚀 Railway дээр deploy хийх заавар

Décante платформыг [Railway](https://railway.app) дээр байршуулах алхам алхмаар заавар.

---

## 🌏 Region — Монголд хамгийн ойр нь Сингапур

Railway дээр **Монголд байрлах сервер байхгүй** (Монголд томоохон cloud region байдаггүй).
Railway-ийн region-уудаас Монголд хамгийн ойр нь:

| Region | Улаанбаатараас ойролцоо latency |
|--------|-------------------------------|
| **Southeast Asia (Сингапур)** ⭐ | ~90–140 мс |
| EU West (Амстердам) | ~150–200 мс |
| US West / East | ~180–260 мс |

➡️ **Сингапур (Southeast Asia)-г сонго.** Жижиг дэлгүүрт 100–150мс latency огт мэдрэгдэхгүй.

> ⚠️ Зарим region-ыг (Сингапур орно) Railway төлбөртэй plan дээр л сонгуулдаг байж
> болзошгүй. Service → **Settings → Regions** хэсгээс шалгаж сонгоно.

### 🔥 Хурдыг нэмэх нэмэлт (санал болгоё): Cloudflare (үнэгүй)
Домэйнээ **Cloudflare**-ээр дамжуулбал (үнэгүй):
- Статик файл (CSS/JS/зураг) Монголд ойр edge-ээс кэшлэгдэж **хурдан** уншина
- Үнэгүй HTTPS, DDoS хамгаалалт
- Динамик API нь Сингапур руу явна, статик нь ойроос — хосолмол хурд

Хэрэв latency туйлын чухал бол Токио/Сөүлтэй провайдер (жишээ VPS: Vultr Seoul,
Linode Tokyo) илүү ойр — гэхдээ Railway-д хамгийн ойр нь Сингапур хэвээр.

---

## 1️⃣ Кодоо GitHub-д байршуулах

Railway нь ихэвчлэн GitHub repo-оос deploy хийдэг.

1. [github.com](https://github.com) дээр шинэ **Private** repo үүсгэ (жишээ `decante`).
2. Төслийн хавтас дотор терминал нээж:

```bash
git init
git add .
git commit -m "Décante v1"
git branch -M main
git remote add origin https://github.com/<таны-нэр>/decante.git
git push -u origin main
```

> `.gitignore` нь `data/` (хэрэглэгчийн мэдээлэл) болон `.env`-г repo-д оруулахгүй.

---

## 2️⃣ Railway дээр төсөл үүсгэх

1. [railway.app](https://railway.app) → **GitHub-аар нэвтэр**.
2. **New Project → Deploy from GitHub repo** → дээрх repo-гоо сонго.
3. Railway автоматаар Node илрүүлж `npm start` (= `node server.js`) ажиллуулна.
4. Service → **Settings → Regions** → **Southeast Asia (Singapore)** сонго.

---

## 3️⃣ Volume холбох (ЗААВАЛ — өгөгдөл хадгалахын тулд)

Volume байхгүй бол redeploy болох бүрд захиалга, хэрэглэгч **устана**.

1. Service дээр → **New → Volume** (эсвэл Settings → Volumes → Add).
2. **Mount path:** `/data`
3. Хадгал. Одоо `db.json` энэ дискэн дээр байнга үлдэнэ.

---

## 4️⃣ Орчны хувьсагч тохируулах (Variables)

Service → **Variables** → дараахыг нэм:

| Нэр | Утга |
|-----|------|
| `DATA_DIR` | `/data` |
| `SECURE_COOKIES` | `1` |
| `ADMIN_EMAIL` | таны админ и-мэйл |
| `ADMIN_PASSWORD` | **хүчтэй** нууц үг |

> `PORT`-ыг Railway өөрөө өгдөг тул **бүү нэм**.
>
> ⚠️ `ADMIN_PASSWORD` нь зөвхөн **анхны** (сан хоосон) үед админ үүсгэхэд ашиглагдана.
> Тиймээс эхний удаад л сайн нууц үг тавь.

---

## 5️⃣ Домэйн авах ба шалгах

1. Service → **Settings → Networking → Generate Domain** → үнэгүй HTTPS домэйн
   (жишээ `decante-production.up.railway.app`).
2. Нээж шалга:
   - Дэлгүүр: `https://<домэйн>/`
   - Админ: `https://<домэйн>/admin`

### Өөрийн домэйн холбох (сонголт)
Settings → Networking → **Custom Domain** → өөрийн домэйн (жишээ `decante.mn`)
оруулаад, DNS дээр зааж өгсөн **CNAME** бичлэгийг нэмнэ.
(Cloudflare ашиглаж байвал CNAME-ийг Cloudflare дээр нэмнэ.)

---

## 🔁 Шинэчлэлт хийх

Кодоо өөрчлөөд GitHub руу дахин push хийхэд Railway **автоматаар** дахин deploy хийнэ:

```bash
git add .
git commit -m "Шинэчлэлт"
git push
```

---

## 🛠 Railway CLI-аар (GitHub-гүй хувилбар)

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Volume болон Variables-ийг дашбордоос дээрхтэй адил тохируулна.

---

## ✅ Deploy-ийн дараах шалгалт

- [ ] Дэлгүүр нээгдэж, бараа харагдаж байна
- [ ] Бүртгүүлж, нэвтэрч, сагслаж, захиалга өгч болж байна
- [ ] `/admin` дээр админаар нэвтэрч, захиалга харагдаж байна
- [ ] Redeploy хийсний дараа өгөгдөл **хэвээр** байна (Volume зөв)
- [ ] Админ нууц үгээ хүчтэй болгосон
