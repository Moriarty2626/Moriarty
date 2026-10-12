/* ===== Криптография (Web Crypto API) ===== */
const ITERATIONS = 100000;
const HASH_ALG = 'SHA-256';

function b64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function hashPassword(password, saltB64) {
  const salt = b64ToBuf(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH_ALG },
    keyMaterial,
    256
  );
  return bufToB64(derived);
}

async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bufToB64(salt);
  const hash = await hashPassword(password, saltB64);
  return { salt: saltB64, hash };
}

async function verifyPassword(password, saltB64, expectedHash) {
  const hash = await hashPassword(password, saltB64);
  return hash === expectedHash;
}

/* ===== Хранилище аккаунтов ===== */
// В исходниках НЕТ пароля в открытом виде — только хеш + соль.
const SEED_ACCOUNTS = [
  {
    id: 'acc_head_seed',
    username: 'Глава',
    role: 'head',
    salt: 'MMunnPZNyAxtcgJtP+9jbg==',
    hash: 'J7xi3Df9uyK+CJcuziOA5HcaYlkfqitDQrasIfqW7T8=',
  },
];

function loadAccounts() {
  const raw = localStorage.getItem('moriarty_accounts');
  if (!raw) {
    localStorage.setItem('moriarty_accounts', JSON.stringify(SEED_ACCOUNTS));
    return [...SEED_ACCOUNTS];
  }
  try {
    const list = JSON.parse(raw);
    const hasHead = list.some(a => a.role === 'head');
    if (!hasHead) {
      list.push(SEED_ACCOUNTS[0]);
      localStorage.setItem('moriarty_accounts', JSON.stringify(list));
    }
    return list;
  } catch {
    localStorage.setItem('moriarty_accounts', JSON.stringify(SEED_ACCOUNTS));
    return [...SEED_ACCOUNTS];
  }
}

function saveAccounts(list) {
  localStorage.setItem('moriarty_accounts', JSON.stringify(list));
}

function findAccount(username, role) {
  const accounts = loadAccounts();
  return accounts.find(
    a => a.username.toLowerCase() === username.toLowerCase() && a.role === role
  );
}

/* ===== Состояние сессии ===== */
const state = {
  role: null,
  username: null,
  hasSecretAccess: false,
};

const ROLE_LABELS = {
  observer: 'Наблюдатель',
  master: 'Магистр ордена',
  head: 'Глава ордена',
};

/* ===== DOM ===== */
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const roleSelect = document.getElementById('role');
const usernameInput = document.getElementById('username');
const passwordBlock = document.getElementById('password-block');
const passwordInput = document.getElementById('password');
const enterBtn = document.getElementById('enter-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const settingsBtn = document.getElementById('settings-btn');
const userRoleBadge = document.getElementById('user-role-badge');
const userNameDisplay = document.getElementById('user-name-display');
const secretsBtn = document.getElementById('secrets-btn');
const secretsLocked = document.getElementById('secrets-locked');
const secretsContent = document.getElementById('secrets-content');
const inviteCodeInput = document.getElementById('invite-code');
const redeemInviteBtn = document.getElementById('redeem-invite');
const inviteError = document.getElementById('invite-error');
const masterPanel = document.getElementById('master-panel');
const generateInviteBtn = document.getElementById('generate-invite');
const inviteResult = document.getElementById('invite-result');
const generatedCode = document.getElementById('generated-code');
const copyCodeBtn = document.getElementById('copy-code');
const navBtns = document.querySelectorAll('.nav-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

const changePasswordForm = document.getElementById('change-password-form');
const pwChangeHint = document.getElementById('pw-change-hint');
const oldPasswordInput = document.getElementById('old-password');
const newPasswordInput = document.getElementById('new-password');
const newPassword2Input = document.getElementById('new-password2');
const changePwBtn = document.getElementById('change-pw-btn');
const changePwMsg = document.getElementById('change-pw-msg');
const adminBlock = document.getElementById('admin-block');
const newAccName = document.getElementById('new-acc-name');
const newAccRole = document.getElementById('new-acc-role');
const newAccPassword = document.getElementById('new-acc-password');
const createAccBtn = document.getElementById('create-acc-btn');
const createAccMsg = document.getElementById('create-acc-msg');
const changeNameBtn = document.getElementById('change-name-btn');
const newDisplayName = document.getElementById('new-display-name');
const changeNameMsg = document.getElementById('change-name-msg');


function init() {
  roleSelect.addEventListener('change', () => {
    const needPw = roleSelect.value !== 'observer';
    passwordBlock.classList.toggle('hidden', !needPw);
    if (!needPw) passwordInput.value = '';
  });

  enterBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  settingsBtn.addEventListener('click', () => switchTab('settings'));
  redeemInviteBtn.addEventListener('click', handleRedeemInvite);
  generateInviteBtn.addEventListener('click', handleGenerateInvite);
  copyCodeBtn.addEventListener('click', handleCopyCode);
  changePwBtn.addEventListener('click', handleChangePassword);
  createAccBtn.addEventListener('click', handleCreateAccount);
  if (changeNameBtn) changeNameBtn.addEventListener('click', handleChangeName);
  const deleteAccBtn = document.getElementById('delete-acc-btn');
  if (deleteAccBtn) deleteAccBtn.addEventListener('click', handleDeleteAccount);
  ensureAccountIds();

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  inviteCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleRedeemInvite(); });

  const saved = localStorage.getItem('moriarty_session');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      state.role = s.role;
      state.username = s.username;
      state.hasSecretAccess = !!s.hasSecretAccess;
      state.accountId = s.accountId || null;
      showMain();
    } catch {
      localStorage.removeItem('moriarty_session');
    }
  }

  loadAccounts();
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function hideLoginError() {
  loginError.classList.add('hidden');
}

async function handleLogin() {
  hideLoginError();
  const role = roleSelect.value;
  const username = usernameInput.value.trim();

  if (!username) {
    showLoginError('Введите имя');
    return;
  }

  if (role === 'observer') {
    state.role = 'observer';
    state.username = username;
    state.hasSecretAccess = false;
    saveSession();
    showMain();
    return;
  }

  const password = passwordInput.value;
  if (!password) {
    showLoginError('Введите пароль');
    return;
  }

  const acc = findAccount(username, role);
  if (!acc) {
    showLoginError('Аккаунт не найден. Обратитесь к Главе или Магистру.');
    return;
  }

  enterBtn.disabled = true;
  enterBtn.textContent = 'Проверка...';

  try {
    const ok = await verifyPassword(password, acc.salt, acc.hash);
    if (!ok) {
      showLoginError('Неверный пароль');
      return;
    }

    state.role = role;
    state.username = acc.username;
    state.hasSecretAccess = true;
    state.accountId = acc.id || null;
    if (!state.accountId) {
      ensureAccountIds();
      const a2 = findAccount(username, role);
      state.accountId = a2 ? a2.id : null;
    }
    saveSession();
    showMain();
  } catch (e) {
    showLoginError('Ошибка проверки пароля');
    console.error(e);
  } finally {
    enterBtn.disabled = false;
    enterBtn.textContent = 'Войти в архивы';
  }
}

function handleLogout() {
  state.role = null;
  state.username = null;
  state.hasSecretAccess = false;
  state.accountId = null;
  localStorage.removeItem('moriarty_session');
  loginScreen.classList.add('active');
  mainScreen.classList.remove('active');
  usernameInput.value = '';
  passwordInput.value = '';
  roleSelect.value = 'observer';
  passwordBlock.classList.add('hidden');
  hideLoginError();
  switchTab('origin');
}

function saveSession() {
  localStorage.setItem('moriarty_session', JSON.stringify({
    role: state.role,
    username: state.username,
    hasSecretAccess: state.hasSecretAccess,
    accountId: state.accountId || null,
  }));
}

function showMain() {
  loginScreen.classList.remove('active');
  mainScreen.classList.add('active');

  userRoleBadge.textContent = ROLE_LABELS[state.role];
  userRoleBadge.className = 'badge ' + state.role;
  userNameDisplay.textContent = state.username;

  if (state.role === 'master' || state.role === 'head') {
    masterPanel.classList.remove('hidden');
  } else {
    masterPanel.classList.add('hidden');
  }

  if (state.role === 'master' || state.role === 'head') {
    changePasswordForm.classList.remove('hidden');
    pwChangeHint.classList.add('hidden');
  } else {
    changePasswordForm.classList.add('hidden');
    pwChangeHint.classList.remove('hidden');
  }

  if (state.role === 'master' || state.role === 'head') {
    adminBlock.classList.remove('hidden');
  } else {
    adminBlock.classList.add('hidden');
  }

  const delBlock = document.getElementById('delete-acc-block');
  if (delBlock) {
    if (state.role === 'master' || state.role === 'head') {
      delBlock.classList.remove('hidden');
    } else {
      delBlock.classList.add('hidden');
    }
  }

  updateSecretsAccess();
}

function updateSecretsAccess() {
  if (state.hasSecretAccess) {
    secretsBtn.classList.add('unlocked');
    secretsBtn.querySelector('.lock-icon').textContent = '🔓';
    secretsLocked.classList.add('hidden');
    secretsContent.classList.remove('hidden');
  } else {
    secretsBtn.classList.remove('unlocked');
    secretsBtn.querySelector('.lock-icon').textContent = '🔒';
    secretsLocked.classList.remove('hidden');
    secretsContent.classList.add('hidden');
  }
}

function switchTab(tabId) {
  navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  if (tabId === 'settings') {
    navBtns.forEach(btn => btn.classList.remove('active'));
  }
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === 'tab-' + tabId);
  });
}

function loadInvites() {
  return JSON.parse(localStorage.getItem('moriarty_invites') || '[]');
}

function saveInvites(list) {
  localStorage.setItem('moriarty_invites', JSON.stringify(list));
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function handleGenerateInvite() {
  if (state.role !== 'master' && state.role !== 'head') return;
  const code = generateCode();
  const invites = loadInvites();
  invites.push({ code, createdBy: state.username, createdAt: Date.now(), used: false });
  saveInvites(invites);
  generatedCode.textContent = code;
  inviteResult.classList.remove('hidden');
}

function handleCopyCode() {
  navigator.clipboard.writeText(generatedCode.textContent).then(() => {
    copyCodeBtn.textContent = 'Скопировано';
    setTimeout(() => { copyCodeBtn.textContent = 'Копировать'; }, 1500);
  });
}

function handleRedeemInvite() {
  const code = inviteCodeInput.value.trim().toUpperCase();
  if (!code) {
    inviteError.textContent = 'Введите код';
    inviteError.classList.remove('hidden');
    return;
  }
  const invites = loadInvites();
  const invite = invites.find(i => i.code === code && !i.used);
  if (!invite) {
    inviteError.textContent = 'Неверный или уже использованный код';
    inviteError.classList.remove('hidden');
    return;
  }
  invite.used = true;
  invite.usedBy = state.username;
  saveInvites(invites);
  state.hasSecretAccess = true;
  saveSession();
  updateSecretsAccess();
  inviteCodeInput.value = '';
  inviteError.classList.add('hidden');
}


function findAccountById(id) {
  return loadAccounts().find(a => a.id === id);
}

function ensureAccountIds() {
  const accounts = loadAccounts();
  let changed = false;
  accounts.forEach(a => {
    if (!a.id) {
      a.id = 'acc_' + Math.random().toString(36).slice(2, 12);
      changed = true;
    }
  });
  if (changed) saveAccounts(accounts);
  return accounts;
}

function isNameTaken(name, exceptId) {
  const n = name.toLowerCase();
  return loadAccounts().some(a => a.username.toLowerCase() === n && a.id !== exceptId);
}

async function handleChangePassword() {
  changePwMsg.classList.add('hidden');
  if (state.role !== 'master' && state.role !== 'head') return;

  const oldPw = oldPasswordInput.value;
  const newPw = newPasswordInput.value;
  const newPw2 = newPassword2Input.value;

  if (!oldPw || !newPw) {
    showMsg(changePwMsg, 'Заполните все поля', false);
    return;
  }
  if (newPw.length < 6) {
    showMsg(changePwMsg, 'Новый пароль минимум 6 символов', false);
    return;
  }
  if (newPw !== newPw2) {
    showMsg(changePwMsg, 'Пароли не совпадают', false);
    return;
  }

  ensureAccountIds();
  const accounts = loadAccounts();
  let idx = -1;
  if (state.accountId) {
    idx = accounts.findIndex(a => a.id === state.accountId);
  }
  if (idx === -1) {
    idx = accounts.findIndex(
      a => a.username.toLowerCase() === state.username.toLowerCase() && a.role === state.role
    );
  }
  if (idx === -1) {
    showMsg(changePwMsg, 'Аккаунт не найден', false);
    return;
  }

  const acc = accounts[idx];
  const ok = await verifyPassword(oldPw, acc.salt, acc.hash);
  if (!ok) {
    showMsg(changePwMsg, 'Неверный текущий пароль', false);
    return;
  }

  const record = await createPasswordRecord(newPw);
  accounts[idx] = { ...acc, salt: record.salt, hash: record.hash };
  saveAccounts(accounts);
  state.accountId = accounts[idx].id;
  saveSession();

  oldPasswordInput.value = '';
  newPasswordInput.value = '';
  newPassword2Input.value = '';
  showMsg(changePwMsg, 'Пароль успешно изменён', true);
}

async function handleCreateAccount() {
  createAccMsg.classList.add('hidden');
  if (state.role !== 'master' && state.role !== 'head') return;

  const name = newAccName.value.trim();
  const role = newAccRole.value;
  const password = newAccPassword.value;

  if (!name || !password) {
    showMsg(createAccMsg, 'Заполните имя и пароль', false);
    return;
  }
  if (password.length < 6) {
    showMsg(createAccMsg, 'Пароль минимум 6 символов', false);
    return;
  }
  if (role === 'head') {
    showMsg(createAccMsg, 'Глава ордена может быть только один', false);
    return;
  }
  if (state.role === 'master' && role !== 'master') {
    showMsg(createAccMsg, 'Магистр может создавать только Магистров', false);
    return;
  }

  ensureAccountIds();
  if (isNameTaken(name, null)) {
    showMsg(createAccMsg, 'Такое имя уже занято', false);
    return;
  }

  const record = await createPasswordRecord(password);
  const accounts = loadAccounts();
  accounts.push({
    id: 'acc_' + Math.random().toString(36).slice(2, 12),
    username: name,
    role,
    salt: record.salt,
    hash: record.hash,
  });
  saveAccounts(accounts);

  newAccName.value = '';
  newAccPassword.value = '';
  showMsg(createAccMsg, 'Аккаунт «' + name + '» (' + ROLE_LABELS[role] + ') создан', true);
}

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
  el.classList.remove('hidden');
}

function handleChangeName() {
  if (!changeNameMsg || !newDisplayName) return;
  changeNameMsg.classList.add('hidden');
  const name = newDisplayName.value.trim();
  if (!name) {
    showMsg(changeNameMsg, 'Введите имя', false);
    return;
  }

  ensureAccountIds();
  const accounts = loadAccounts();
  let idx = -1;
  if (state.accountId) {
    idx = accounts.findIndex(a => a.id === state.accountId);
  }
  if (idx === -1 && (state.role === 'master' || state.role === 'head')) {
    idx = accounts.findIndex(
      a => a.username.toLowerCase() === state.username.toLowerCase() && a.role === state.role
    );
  }

  const exceptId = idx >= 0 ? accounts[idx].id : state.accountId;
  if (isNameTaken(name, exceptId)) {
    showMsg(changeNameMsg, 'Такое имя уже занято', false);
    return;
  }

  if (idx >= 0) {
    accounts[idx].username = name;
    saveAccounts(accounts);
    state.accountId = accounts[idx].id;
  }

  state.username = name;
  saveSession();
  if (userNameDisplay) userNameDisplay.textContent = name;
  newDisplayName.value = '';
  showMsg(changeNameMsg, 'Имя сохранено', true);
}

async function handleDeleteAccount() {
  const msgEl = document.getElementById('delete-acc-msg');
  const pwEl = document.getElementById('delete-password');
  if (!msgEl || !pwEl) return;
  msgEl.classList.add('hidden');
  if (state.role !== 'master' && state.role !== 'head') return;

  const pw = pwEl.value;
  if (!pw) {
    showMsg(msgEl, 'Введите пароль', false);
    return;
  }

  ensureAccountIds();
  const accounts = loadAccounts();
  let idx = -1;
  if (state.accountId) {
    idx = accounts.findIndex(a => a.id === state.accountId);
  }
  if (idx === -1) {
    idx = accounts.findIndex(
      a => a.username.toLowerCase() === state.username.toLowerCase() && a.role === state.role
    );
  }
  if (idx === -1) {
    showMsg(msgEl, 'Аккаунт не найден', false);
    return;
  }

  const acc = accounts[idx];
  if (acc.role === 'head') {
    showMsg(msgEl, 'Аккаунт Главы нельзя удалить', false);
    return;
  }

  const ok = await verifyPassword(pw, acc.salt, acc.hash);
  if (!ok) {
    showMsg(msgEl, 'Неверный пароль', false);
    return;
  }

  accounts.splice(idx, 1);
  saveAccounts(accounts);
  pwEl.value = '';
  showMsg(msgEl, 'Аккаунт удалён', true);
  setTimeout(() => handleLogout(), 800);
}

/* Secrets sub-tabs */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.secrets-subbtn');
  if (!btn) return;
  const id = btn.dataset.secret;
  document.querySelectorAll('.secrets-subbtn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.secret-subpanel').forEach(p => {
    const match = p.id === 'secret-panel-' + id;
    p.classList.toggle('active', match);
    p.classList.toggle('hidden', !match);
  });
});

init();
