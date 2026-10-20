/* DreamCraft Panel — app logic */
const ROLE_LEVEL = {
  'o5': 999,
  creator: 100,
  upravlyayushiy: 90,
  rukovodstvo: 80,
  rp_master: 50,
  tech: 40,
  builders: 40,
  iad: 40,
  discord: 30,
  dreamcraft: 20
};

const ROLES = [
  { id: 'o5', name: '???', level: 999 },
  { id: 'creator', name: 'Создатель', level: 100 },
  { id: 'upravlyayushiy', name: 'Управляющий', level: 90 },
  { id: 'rukovodstvo', name: 'Руководство', level: 80 },
  { id: 'rp_master', name: 'RP-мастер', level: 50 },
  { id: 'tech', name: 'Тех.Администрация', level: 40 },
  { id: 'builders', name: 'Строители', level: 40 },
  { id: 'iad', name: 'IAD', level: 40 },
  { id: 'discord', name: 'Discord-отдел', level: 30 },
  { id: 'dreamcraft', name: 'DreamCraft (MC)', level: 20 }
];

const STORAGE_KEY = 'dc_users_v5';
const SESSION_KEY = 'dc_session_v5';

function roleName(id) {
  const r = ROLES.find(x => x.id === id);
  return r ? r.name : id;
}


function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return 'h' + Math.abs(h).toString(16) + '_' + btoa(unescape(encodeURIComponent(str))).slice(0, 24);
}

function getUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const seed = [{
    id: '???', login: '???', passwordHash: hash('*PsijGQRqVkmfxegnK6j&Cqdk0jh3S'),
    email: null, role: 'o5', displayName: '???',
    createdAt: new Date().toISOString(), createdBy: 'system'
  }, {
    id: '1', login: 'creator', passwordHash: hash('DreamCraft2026!'),
    email: null, role: 'creator', displayName: 'Создатель',
    createdAt: new Date().toISOString(), createdBy: 'system'
  }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}
function saveUsers(users) { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }
function getSession() {
  try { const r = sessionStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function setSession(u) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let currentUser = null;

function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#main-screen').classList.add('hidden');
}
function showMain() {
  $('#login-screen').classList.add('hidden');
  $('#main-screen').classList.remove('hidden');
}

function md(text) {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  html = html.replace(/\|(.+)\|/g, row => {
    if (/^[\s|:-]+$/.test(row.replace(/\|/g, ''))) return '';
    const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
    return '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, m => '<table>' + m + '</table>');
  return html.split('\n\n').map(p => {
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<table')) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

function hideAllPanels() {
  ['panel-docs', 'panel-users', 'panel-settings', 'panel-cheats', 'panel-guide'].forEach(id => {
    const el = $('#' + id); if (el) el.classList.add('hidden');
  });
  $$('.nav-item').forEach(b => b.classList.remove('active'));
}

function openPanel(name) {
  hideAllPanels();
  const el = $('#panel-' + name);
  if (el) el.classList.remove('hidden');
}

function loadDocsNav() {
  const nav = $('#nav-docs');
  nav.innerHTML = '';
  const docs = window.DOCS || {};
  Object.keys(docs).forEach(id => {
    const doc = docs[id];
    if (!doc.roles.includes(currentUser.role) && currentUser.role !== 'creator' && currentUser.role !== 'o5') return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.textContent = doc.title;
    btn.onclick = () => {
      hideAllPanels();
      btn.classList.add('active');
      const panel = $('#panel-docs');
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <h1>${doc.title}</h1>
        <div class="meta">Только для авторизованных сотрудников</div>
        <div class="doc-content">${md(doc.content)}</div>
      `;
    };
    nav.appendChild(btn);
  });
}

function canDelete(targetRole, targetId) {
  if (targetId && targetId === currentUser.id) return false;
  if (currentUser.role === 'o5') return true;
  if (currentUser.role === 'creator' || currentUser.role === 'upravlyayushiy') {
    return targetRole !== 'creator' && targetRole !== 'o5';
  }
  return (ROLE_LEVEL[targetRole] || 0) < (ROLE_LEVEL[currentUser.role] || 0);
}

function loadUsersUI() {
  const users = getUsers();
  const list = $('#users-list');
  list.innerHTML = '';
  const roleSelect = $('#new-role');
  roleSelect.innerHTML = '';
  const myLevel = ROLE_LEVEL[currentUser.role] || 0;
  ROLES.forEach(r => {
    if (currentUser.role === 'o5' || currentUser.role === 'creator' || r.level < myLevel) {
      if (currentUser.role === 'creator' && r.id === 'o5') return;
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      roleSelect.appendChild(opt);
    }
  });
  users.forEach(u => {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
      <div>
        <strong>${u.displayName || u.login}</strong>
        <span class="role-tag">${roleName(u.role)}</span>
        <div style="font-size:12px;color:var(--text2);margin-top:3px">
          ${u.login}${u.email ? ' · ' + u.email : ''}
        </div>
      </div>
      ${canDelete(u.role, u.id) ? `<button class="del-btn" data-id="${u.id}">Удалить</button>` : ''}
    `;
    list.appendChild(card);
  });
  $$('.del-btn').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Удалить аккаунт?')) return;
      saveUsers(getUsers().filter(u => u.id !== btn.dataset.id));
      loadUsersUI();
    };
  });
}

function initMain(user) {
  currentUser = user;
  $('#user-info').innerHTML = `<strong>${user.displayName || user.login}</strong>${roleName(user.role)}`;
  const canManage = (ROLE_LEVEL[user.role] || 0) >= 80 || user.role === 'o5';
  if (canManage) $('#btn-users').classList.remove('hidden');
  else $('#btn-users').classList.add('hidden');
  loadDocsNav();
  showMain();
  openPanel('docs');
  $('#panel-docs').innerHTML = `<div class="welcome"><h1>Добро пожаловать</h1><p>Выберите документ слева</p></div>`;
}

$('#login-form').onsubmit = e => {
  e.preventDefault();
  $('#login-error').textContent = '';
  const login = $('#login-input').value.trim();
  const password = $('#password-input').value;
  const users = getUsers();
  const user = users.find(u => u.login.toLowerCase() === login.toLowerCase());
  if (!user || user.passwordHash !== hash(password)) {
    $('#login-error').textContent = 'Неверный логин или пароль';
    return;
  }
  const session = { id: user.id, login: user.login, role: user.role, displayName: user.displayName };
  setSession(session);
  initMain(session);
};

$('#btn-logout').onclick = () => { clearSession(); currentUser = null; showLogin(); };

$('#btn-users').onclick = () => { openPanel('users'); loadUsersUI(); };

$('#btn-settings').onclick = () => {
  openPanel('settings');
  $('#set-name').value = currentUser.displayName || '';
  $('#name-msg').textContent = '';
  $('#pass-msg').textContent = '';
  $('#set-old-pass').value = '';
  $('#set-new-pass').value = '';
  $('#set-new-pass2').value = '';
};

$('#nav-cheats').onclick = function () {
  openPanel('cheats');
  this.classList.add('active');
};
$('#nav-guide').onclick = function () {
  openPanel('guide');
  this.classList.add('active');
};

$('#btn-create').onclick = () => {
  const msg = $('#create-msg');
  msg.textContent = ''; msg.className = 'msg';
  const login = $('#new-login').value.trim();
  const password = $('#new-password').value;
  const email = $('#new-email').value.trim() || null;
  const displayName = $('#new-displayname').value.trim() || login;
  const role = $('#new-role').value;
  if (!login || !password || !role) {
    msg.textContent = 'Заполни логин, пароль и роль'; msg.className = 'msg err'; return;
  }
  const users = getUsers();
  if (users.find(u => u.login.toLowerCase() === login.toLowerCase())) {
    msg.textContent = 'Логин уже занят'; msg.className = 'msg err'; return;
  }
  const myLvl = ROLE_LEVEL[currentUser.role] || 0;
  const targetLvl = ROLE_LEVEL[role] || 0;
  if (currentUser.role !== 'o5') {
    if (role === 'o5') { msg.textContent = 'Нельзя создавать роль ??-?'; msg.className = 'msg err'; return; }
    if (currentUser.role === 'creator') {
      // ok: can create creator and below
    } else if (targetLvl >= myLvl) {
      msg.textContent = 'Нельзя создавать аккаунты своего или более высокого уровня'; msg.className = 'msg err'; return;
    }
  }
  users.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    login, passwordHash: hash(password), email, role, displayName,
    createdAt: new Date().toISOString(), createdBy: currentUser.login
  });
  saveUsers(users);
  msg.textContent = 'Аккаунт создан'; msg.className = 'msg ok';
  $('#new-login').value = ''; $('#new-password').value = '';
  $('#new-email').value = ''; $('#new-displayname').value = '';
  loadUsersUI();
};

$('#btn-save-name').onclick = () => {
  const msg = $('#name-msg');
  const name = $('#set-name').value.trim();
  if (!name) { msg.textContent = 'Введи имя'; msg.className = 'msg err'; return; }
  const users = getUsers();
  const u = users.find(x => x.id === currentUser.id);
  if (!u) return;
  u.displayName = name;
  saveUsers(users);
  currentUser.displayName = name;
  setSession(currentUser);
  $('#user-info').innerHTML = `<strong>${name}</strong>${roleName(currentUser.role)}`;
  msg.textContent = 'Имя сохранено'; msg.className = 'msg ok';
};

$('#btn-save-pass').onclick = () => {
  const msg = $('#pass-msg');
  const oldP = $('#set-old-pass').value;
  const newP = $('#set-new-pass').value;
  const newP2 = $('#set-new-pass2').value;
  if (!oldP || !newP) { msg.textContent = 'Заполни поля'; msg.className = 'msg err'; return; }
  if (newP !== newP2) { msg.textContent = 'Новые пароли не совпадают'; msg.className = 'msg err'; return; }
  if (newP.length < 4) { msg.textContent = 'Пароль слишком короткий'; msg.className = 'msg err'; return; }
  const users = getUsers();
  const u = users.find(x => x.id === currentUser.id);
  if (!u || u.passwordHash !== hash(oldP)) {
    msg.textContent = 'Текущий пароль неверный'; msg.className = 'msg err'; return;
  }
  u.passwordHash = hash(newP);
  saveUsers(users);
  msg.textContent = 'Пароль изменён'; msg.className = 'msg ok';
  $('#set-old-pass').value = ''; $('#set-new-pass').value = ''; $('#set-new-pass2').value = '';
};

const session = getSession();
if (session) initMain(session);
else showLogin();
