/**
 * session.js — Хэрэглэгчийн session (frontend)
 * =====================================================================
 * • Нэвтрэлт / бүртгэл / гарах
 * • Толгой дахь хэрэглэгчийн цэс
 * • Профайл засах, миний захиалгын түүх
 * • Бусад модуль (app.js)-д одоогийн хэрэглэгчийг мэдэгдэнэ
 */
window.PM = window.PM || {};

PM.session = (function () {
  "use strict";
  var u = PM.utils;
  var user = null;
  var listeners = [];
  var pendingOnAuth = null; // амжилттай нэвтэрсний дараа гүйцэтгэх үйлдэл

  /* ---------------- Төлөв ---------------- */
  function current() { return user; }
  function isAuthed() { return !!user; }
  function isAdmin() { return !!user && user.role === "admin"; }

  function subscribe(fn) {
    listeners.push(fn);
    fn(user);
    return function () {
      var i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }
  function emit() {
    renderAccount();
    for (var i = 0; i < listeners.length; i++) listeners[i](user);
  }

  /* ---------------- API дуудлагууд ---------------- */
  async function load() {
    try {
      var r = await PM.api.get("/auth/me");
      user = r.user;
    } catch (e) { user = null; }
    emit();
    return user;
  }

  async function login(email, password) {
    var r = await PM.api.post("/auth/login", { email: email, password: password });
    user = r.user; emit(); return user;
  }
  async function register(data) {
    var r = await PM.api.post("/auth/register", data);
    user = r.user; emit(); return r; // { user, needsVerification }
  }
  async function logout() {
    try { await PM.api.post("/auth/logout"); } catch (e) {}
    user = null; emit();
    u.toast("Гарлаа", "info");
  }
  async function updateProfile(patch) {
    var r = await PM.api.patch("/auth/me", patch);
    user = r.user; emit(); return user;
  }
  function sendCode(purpose, email) {
    return PM.api.post("/auth/send-code", { purpose: purpose, email: email });
  }
  async function confirmEmail(code) {
    var r = await PM.api.post("/auth/verify-email", { code: code });
    user = r.user; emit(); return user;
  }
  async function resetPassword(email, code, newPassword) {
    var r = await PM.api.post("/auth/reset-password", { email: email, code: code, newPassword: newPassword });
    user = r.user; emit(); return user;
  }

  /* ---------------- Толгой дахь хэрэглэгчийн цэс ---------------- */
  function renderAccount() {
    var host = u.qs("#account-area");
    if (!host) return;

    if (!user) {
      host.innerHTML =
        '<button type="button" class="btn btn--outline btn--sm" data-action="open-auth">Нэвтрэх</button>';
      return;
    }

    var firstName = (user.name || "").split(" ")[0] || "Хэрэглэгч";
    var adminLink = isAdmin()
      ? '<a class="menu__item" href="/admin">Админ самбар</a>' : "";

    host.innerHTML =
      '<div class="account">' +
        '<button type="button" class="account__btn" data-action="toggle-account" aria-expanded="false">' +
          '<span class="account__avatar">' + esc((firstName[0] || "?").toUpperCase()) + "</span>" +
          '<span class="account__name">' + esc(firstName) + "</span>" +
        "</button>" +
        '<div class="menu" hidden>' +
          '<div class="menu__head">' + esc(user.name) +
            '<span>' + esc(user.email) + "</span></div>" +
          '<button type="button" class="menu__item" data-action="open-profile">Профайл</button>' +
          '<button type="button" class="menu__item" data-action="open-orders">Миний захиалга</button>' +
          adminLink +
          '<button type="button" class="menu__item menu__item--danger" data-action="logout">Гарах</button>' +
        "</div>" +
      "</div>";
  }

  function toggleMenu(force) {
    var menu = u.qs("#account-area .menu");
    var btn = u.qs("#account-area .account__btn");
    if (!menu) return;
    var show = force != null ? force : menu.hidden;
    menu.hidden = !show;
    if (btn) btn.setAttribute("aria-expanded", String(show));
  }

  /* ---------------- Нэвтрэх / Бүртгүүлэх modal ---------------- */
  function openAuth(opts) {
    opts = opts || {};
    if (opts.onSuccess) pendingOnAuth = opts.onSuccess;
    renderAuth(opts.mode || "login", opts.message || "");
  }

  function renderAuth(mode, message) {
    var isLogin = mode !== "register";
    var note = message
      ? '<p class="auth__note">' + esc(message) + "</p>" : "";

    var html =
      '<div class="auth">' +
        '<div class="auth__tabs">' +
          '<button type="button" class="auth__tab' + (isLogin ? " is-active" : "") + '" data-auth-tab="login">Нэвтрэх</button>' +
          '<button type="button" class="auth__tab' + (!isLogin ? " is-active" : "") + '" data-auth-tab="register">Бүртгүүлэх</button>' +
        "</div>" +
        note +
        '<p class="auth__err" hidden></p>' +
        (isLogin ? loginForm() : registerForm()) +
      "</div>";
    PM.modal.open(html);
    wireAuth();
  }

  function loginForm() {
    return (
      '<form class="auth__form" data-auth-form="login">' +
        '<div class="field"><label>И-мэйл</label>' +
          '<input type="email" name="email" autocomplete="email" required placeholder="tanii@mail.mn" /></div>' +
        '<div class="field"><label>Нууц үг</label>' +
          '<input type="password" name="password" autocomplete="current-password" required placeholder="••••••" /></div>' +
        '<div class="auth__row"><button type="button" class="auth__link" data-auth-forgot>Нууц үгээ мартсан уу?</button></div>' +
        '<button type="submit" class="btn btn--solid btn--block">Нэвтрэх</button>' +
      "</form>"
    );
  }
  function registerForm() {
    return (
      '<form class="auth__form" data-auth-form="register">' +
        '<div class="field"><label>Нэр</label>' +
          '<input type="text" name="name" autocomplete="name" required placeholder="Таны нэр" /></div>' +
        '<div class="field"><label>И-мэйл</label>' +
          '<input type="email" name="email" autocomplete="email" required placeholder="tanii@mail.mn" /></div>' +
        '<div class="field"><label>Утас</label>' +
          '<input type="tel" name="phone" autocomplete="tel" placeholder="9900-0000" /></div>' +
        '<div class="field"><label>Нууц үг</label>' +
          '<input type="password" name="password" autocomplete="new-password" required minlength="6" placeholder="Дор хаяж 6 тэмдэгт" /></div>' +
        '<button type="submit" class="btn btn--solid btn--block">Бүртгүүлэх</button>' +
      "</form>"
    );
  }

  function showAuthError(msg) {
    var el = u.qs(".auth__err");
    if (el) { el.textContent = msg; el.hidden = !msg; }
  }

  function runPending() {
    var cb = pendingOnAuth; pendingOnAuth = null;
    if (cb) cb();
  }

  function wireAuth() {
    u.qsa("[data-auth-tab]").forEach(function (t) {
      t.addEventListener("click", function () {
        renderAuth(t.getAttribute("data-auth-tab"));
      });
    });
    var forgot = u.qs("[data-auth-forgot]");
    if (forgot) forgot.addEventListener("click", function () { openForgot(); });

    var form = u.qs("[data-auth-form]");
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      showAuthError("");
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      var isLogin = form.getAttribute("data-auth-form") === "login";
      try {
        if (isLogin) {
          await login(form.email.value.trim(), form.password.value);
          PM.modal.close();
          u.toast("Тавтай морил, " + user.name.split(" ")[0] + "!", "success");
          runPending();
        } else {
          var r = await register({
            name: form.name.value.trim(),
            email: form.email.value.trim(),
            phone: form.phone.value.trim(),
            password: form.password.value,
          });
          u.toast("Тавтай морил, " + user.name.split(" ")[0] + "!", "success");
          if (r && r.needsVerification) {
            openVerifyEmail(); // баталгаажуулсан/алгассаны дараа pending үйлдэл ажиллана
          } else {
            PM.modal.close();
            runPending();
          }
        }
      } catch (err) {
        showAuthError(err.message);
        btn.disabled = false;
      }
    });
  }

  /* ---------------- И-мэйл баталгаажуулах ---------------- */
  function openVerifyEmail() {
    var email = user ? user.email : "";
    var html =
      '<div class="auth">' +
        '<h3 class="modal__title">И-мэйл баталгаажуулах</h3>' +
        '<p class="auth__note">Бид <b>' + esc(email) + '</b> хаяг руу 6 оронтой код илгээлээ. Кодоо оруулна уу.</p>' +
        '<p class="auth__err" hidden></p>' +
        '<form data-verify-form>' +
          '<div class="field"><label>Баталгаажуулах код</label>' +
            '<input name="code" inputmode="numeric" maxlength="6" placeholder="000000" class="otp-input" required /></div>' +
          '<button type="submit" class="btn btn--solid btn--block">Баталгаажуулах</button>' +
        '</form>' +
        '<div class="auth__row auth__row--split">' +
          '<button type="button" class="auth__link" data-resend>Код дахин илгээх</button>' +
          '<button type="button" class="auth__link" data-skip>Дараа нь</button>' +
        '</div>' +
      '</div>';
    PM.modal.open(html);
    var form = u.qs("[data-verify-form]");
    var errEl = u.qs(".auth .auth__err");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      errEl.hidden = true;
      var btn = form.querySelector("button"); btn.disabled = true;
      try {
        await confirmEmail(form.code.value.trim());
        PM.modal.close();
        u.toast("И-мэйл баталгаажлаа ✓", "success");
        runPending();
      } catch (err) { errEl.textContent = err.message; errEl.hidden = false; btn.disabled = false; }
    });
    u.qs("[data-skip]").addEventListener("click", function () {
      PM.modal.close();
      u.toast("И-мэйлээ дараа Профайлаас баталгаажуулж болно", "info");
      runPending();
    });
    u.qs("[data-resend]").addEventListener("click", async function () {
      try { await sendCode("verify"); u.toast("Код дахин илгээлээ", "success"); }
      catch (err) { u.toast(err.message, "error"); }
    });
  }

  /* ---------------- Нууц үг сэргээх ---------------- */
  function openForgot() { renderForgotStep1(""); }

  function renderForgotStep1(prefill) {
    var html =
      '<div class="auth">' +
        '<h3 class="modal__title">Нууц үг сэргээх</h3>' +
        '<p class="auth__note">Бүртгэлтэй и-мэйлээ оруулбал бид код илгээнэ.</p>' +
        '<p class="auth__err" hidden></p>' +
        '<form data-forgot-email>' +
          '<div class="field"><label>И-мэйл</label>' +
            '<input type="email" name="email" required placeholder="tanii@mail.mn" value="' + esc(prefill) + '" /></div>' +
          '<button type="submit" class="btn btn--solid btn--block">Код авах</button>' +
        '</form>' +
        '<div class="auth__row"><button type="button" class="auth__link" data-back-login>← Нэвтрэх рүү</button></div>' +
      '</div>';
    PM.modal.open(html);
    u.qs("[data-back-login]").addEventListener("click", function () { renderAuth("login"); });
    var form = u.qs("[data-forgot-email]");
    var errEl = u.qs(".auth .auth__err");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      errEl.hidden = true;
      var btn = form.querySelector("button"); btn.disabled = true;
      var email = form.email.value.trim();
      try { await sendCode("reset", email); renderForgotStep2(email); }
      catch (err) { errEl.textContent = err.message; errEl.hidden = false; btn.disabled = false; }
    });
  }

  function renderForgotStep2(email) {
    var html =
      '<div class="auth">' +
        '<h3 class="modal__title">Шинэ нууц үг</h3>' +
        '<p class="auth__note">Бид <b>' + esc(email) + '</b> руу код илгээлээ.</p>' +
        '<p class="auth__err" hidden></p>' +
        '<form data-forgot-reset>' +
          '<div class="field"><label>Код</label>' +
            '<input name="code" inputmode="numeric" maxlength="6" placeholder="000000" class="otp-input" required /></div>' +
          '<div class="field"><label>Шинэ нууц үг</label>' +
            '<input type="password" name="newPassword" minlength="6" placeholder="Дор хаяж 6 тэмдэгт" required /></div>' +
          '<button type="submit" class="btn btn--solid btn--block">Нууц үг шинэчлэх</button>' +
        '</form>' +
        '<div class="auth__row auth__row--split">' +
          '<button type="button" class="auth__link" data-resend-reset>Код дахин илгээх</button>' +
          '<button type="button" class="auth__link" data-back-email>← Буцах</button>' +
        '</div>' +
      '</div>';
    PM.modal.open(html);
    u.qs("[data-back-email]").addEventListener("click", function () { renderForgotStep1(email); });
    u.qs("[data-resend-reset]").addEventListener("click", async function () {
      try { await sendCode("reset", email); u.toast("Код дахин илгээлээ", "success"); }
      catch (err) { u.toast(err.message, "error"); }
    });
    var form = u.qs("[data-forgot-reset]");
    var errEl = u.qs(".auth .auth__err");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      errEl.hidden = true;
      var btn = form.querySelector("button"); btn.disabled = true;
      try {
        await resetPassword(email, form.code.value.trim(), form.newPassword.value);
        PM.modal.close();
        u.toast("Нууц үг шинэчлэгдэж, нэвтэрлээ ✓", "success");
        runPending();
      } catch (err) { errEl.textContent = err.message; errEl.hidden = false; btn.disabled = false; }
    });
  }

  /* ---------------- Профайл засах ---------------- */
  function openProfile() {
    if (!user) return openAuth({});
    var html =
      '<div class="profile">' +
        '<h3 class="modal__title">Профайл</h3>' +
        '<p class="auth__err" hidden></p>' +
        '<form data-profile-form>' +
          '<div class="field"><label>Нэр</label>' +
            '<input type="text" name="name" value="' + esc(user.name) + '" required /></div>' +
          '<div class="field"><label>И-мэйл</label>' +
            '<input type="email" value="' + esc(user.email) + '" disabled /></div>' +
          '<div class="profile__verify">' + (user.emailVerified
            ? '<span class="verify-badge verify-badge--ok">✓ И-мэйл баталгаажсан</span>'
            : '<span class="verify-badge">● И-мэйл баталгаажаагүй</span> ' +
              '<button type="button" class="auth__link" data-verify-now>Баталгаажуулах</button>') +
          '</div>' +
          '<div class="field"><label>Утас</label>' +
            '<input type="tel" name="phone" value="' + esc(user.phone || "") + '" placeholder="9900-0000" /></div>' +
          '<div class="field"><label>Хүргэлтийн хаяг</label>' +
            '<input type="text" name="address" value="' + esc(user.address || "") + '" placeholder="Дүүрэг, хороо, байр, тоот" /></div>' +
          '<hr class="profile__sep" />' +
          '<p class="profile__hint">Нууц үг солих бол доорхийг бөглөнө (заавал биш):</p>' +
          '<div class="field"><label>Одоогийн нууц үг</label>' +
            '<input type="password" name="currentPassword" autocomplete="current-password" placeholder="••••••" /></div>' +
          '<div class="field"><label>Шинэ нууц үг</label>' +
            '<input type="password" name="newPassword" autocomplete="new-password" placeholder="Дор хаяж 6 тэмдэгт" /></div>' +
          '<button type="submit" class="btn btn--solid btn--block">Хадгалах</button>' +
        "</form>" +
      "</div>";
    PM.modal.open(html);

    var vBtn = u.qs("[data-verify-now]");
    if (vBtn) vBtn.addEventListener("click", async function () {
      try { await sendCode("verify"); openVerifyEmail(); }
      catch (err) { u.toast(err.message, "error"); }
    });

    var form = u.qs("[data-profile-form]");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var errEl = u.qs(".profile .auth__err");
      errEl.hidden = true;
      var patch = {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        address: form.address.value.trim(),
      };
      if (form.newPassword.value) {
        patch.currentPassword = form.currentPassword.value;
        patch.newPassword = form.newPassword.value;
      }
      try {
        await updateProfile(patch);
        PM.modal.close();
        u.toast("Профайл шинэчлэгдлээ", "success");
      } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false;
      }
    });
  }

  /* ---------------- Миний захиалгын түүх ---------------- */
  async function openOrders() {
    if (!user) return openAuth({});
    PM.modal.open('<div class="orders-view"><h3 class="modal__title">Миний захиалга</h3>' +
      '<p class="muted">Ачаалж байна…</p></div>', { wide: true });
    try {
      var r = await PM.api.get("/orders");
      renderMyOrders(r.orders || []);
    } catch (err) {
      PM.modal.open('<div class="orders-view"><h3 class="modal__title">Миний захиалга</h3>' +
        '<p class="auth__err">' + esc(err.message) + "</p></div>", { wide: true });
    }
  }

  function renderMyOrders(orders) {
    var body;
    if (!orders.length) {
      body = '<p class="muted">Танд одоогоор захиалга алга байна.</p>';
    } else {
      body = '<div class="myorders">' + orders.map(function (o) {
        return (
          '<div class="myorder">' +
            '<div class="myorder__top">' +
              '<span class="myorder__code">' + esc(o.code) + "</span>" +
              PM.ui.statusBadge(o.status) +
            "</div>" +
            '<p class="myorder__date">' + esc(PM.ui.formatDate(o.createdAt)) + "</p>" +
            '<p class="myorder__items">' + PM.ui.orderItemsLine(o) + "</p>" +
            '<p class="myorder__total">Нийт: <b>' + PM.utils.formatPrice(o.total) + "</b></p>" +
          "</div>"
        );
      }).join("") + "</div>";
    }
    PM.modal.open('<div class="orders-view"><h3 class="modal__title">Миний захиалга</h3>' +
      body + "</div>", { wide: true });
  }

  function esc(s) { return PM.utils.escapeHtml(s); }

  return {
    load: load,
    current: current,
    isAuthed: isAuthed,
    isAdmin: isAdmin,
    subscribe: subscribe,
    login: login,
    register: register,
    logout: logout,
    updateProfile: updateProfile,
    openAuth: openAuth,
    openProfile: openProfile,
    openOrders: openOrders,
    toggleMenu: toggleMenu,
  };
})();
