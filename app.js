// ====== FILESYSTEMS ======
const localFs = {
  type: 'dir',
  children: {
    readme: { type: 'file', content: 'GhostOS Kernel 1.0 initialized.\nOPERATOR BRIEF: A rogue node at 192.168.1.44 holds the Vault.\nYour root key is hidden in \\missions. Move fast.' },
    missions: {
      type: 'dir',
      children: {
        'target_01.enc': { type: 'file', content: 'U0lESEFSVEhfUk9PVF9LRVk=' },
        'hint.txt': { type: 'file', content: 'Base64 strings can be decoded with: decrypt <string>' }
      }
    },
    logs: {
      type: 'dir',
      children: {
        'net.log': { type: 'file', content: '[OK] Node 192.168.1.44 active\n[WARN] Firewall port 8080 exposed' }
      }
    }
  }
};

const remoteFs = {
  type: 'dir',
  children: {
    'welcome.txt': { type: 'file', content: 'TARGET NODE 192.168.1.44\nAUTHORIZED PERSONNEL ONLY\nTrace protocol: ACTIVE' },
    admin: {
      type: 'dir',
      children: {
        'notes.txt': { type: 'file', content: 'TODO: move vault password out of this file.\nFor now it is stored as hex. Nobody will ever decode it...\n6b6572616c6132303236' },
        'todo.txt': { type: 'file', content: '- rotate keys\n- fix firewall\n- stop using hex for secrets' }
      }
    },
    vault: {
      type: 'dir',
      children: {
        'vault.dat': { type: 'file', content: 'LOCKED. Run: unlock <password>' }
      }
    }
  }
};

// ====== STATE ======
let root = localFs;
let cwd = [];
let hasKey = false;
let firewallDown = false;
let connected = false;
let trace = 0;
let traceTimer = null;
let spoofs = 2;
let xp = 0;
let stage = 0;
let busy = false;

const TARGET = '192.168.1.44';
const VAULT_PASSWORD = 'kerala2026';

const missions = [
  { id: 1, title: 'Initial Recon', text: 'Find the encrypted payload and decode it.', hint: 'dir, cd, cat, decrypt &lt;text&gt;' },
  { id: 2, title: 'Breach', text: 'Scan the network, crack the firewall, then connect.', hint: 'scan, crack &lt;host:port&gt;, connect &lt;host:port&gt;' },
  { id: 3, title: 'The Vault', text: 'Find the vault password on the target. Beat the trace!', hint: 'cat, hex &lt;string&gt;, unlock &lt;password&gt;, spoof' }
];

// ====== ELEMENTS ======
const $ = id => document.getElementById(id);
const termOut = $('termOut');
const termIn = $('termIn');
const promptLabel = $('promptLabel');
const missionBadge = $('missionBadge');
const traceBadge = $('traceBadge');

// ====== HELPERS ======
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getDir(pathArr = cwd) {
  let node = root;
  for (const part of pathArr) node = node?.children?.[part];
  return node;
}

function print(text, cls = '') {
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = text;
  termOut.appendChild(div);
  termOut.scrollTop = termOut.scrollHeight;
}

async function typeLine(text, cls = '', speed = 10) {
  const div = document.createElement('div');
  if (cls) div.className = cls;
  termOut.appendChild(div);
  for (const ch of text) {
    div.textContent += ch;
    termOut.scrollTop = termOut.scrollHeight;
    await sleep(speed);
  }
}

async function progress(label, ms = 2600) {
  const div = document.createElement('div');
  div.className = 'line-sys';
  termOut.appendChild(div);
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    div.textContent = `${label} [${'█'.repeat(i)}${'░'.repeat(steps - i)}] ${Math.round((i / steps) * 100)}%`;
    termOut.scrollTop = termOut.scrollHeight;
    await sleep(ms / steps);
  }
}

function updatePrompt() {
  const drive = connected ? 'Z:\\TARGET' : 'C:\\GHOST';
  promptLabel.textContent = `${drive}${cwd.length ? '\\' + cwd.join('\\') : ''}>`;
}

function updateBadge() {
  missionBadge.textContent = stage >= missions.length
    ? `ALL DONE • XP ${xp}`
    : `M0${missions[stage].id} • XP ${xp}`;
}

function renderMissions() {
  const el = $('missionText');
  el.innerHTML = missions.map((m, i) =>
    i < stage ? `<h3>[0${m.id}] ${m.title} - DONE</h3>` :
    i === stage ? `<h3>[0${m.id}] ${m.title}</h3><p>${m.text}</p><p>Commands: <code>${m.hint}</code></p>` : ''
  ).join('');
  if (stage >= missions.length) el.innerHTML += '<h3>ALL MISSIONS COMPLETE</h3><p>You emptied the vault. Nice work, operator.</p>';
}

async function completeMission() {
  const m = missions[stage];
  xp += 100;
  stage++;
  updateBadge();
  renderMissions();
  await typeLine(`[*] MISSION 0${m.id} COMPLETE: ${m.title}   +100 XP`, 'line-sys', 14);
}

// ====== TRACE SYSTEM ======
function updateTrace() {
  traceBadge.textContent = connected ? `TRACE: ${Math.floor(trace)}%` : 'TRACE: --';
  traceBadge.classList.toggle('warn', trace >= 70);
}

function startTrace() {
  trace = 0;
  spoofs = 2;
  clearInterval(traceTimer);
  traceTimer = setInterval(() => {
    trace += 1.5;
    updateTrace();
    if (trace >= 100) kickOut();
  }, 1000);
}

function stopTrace() {
  clearInterval(traceTimer);
  trace = 0;
  updateTrace();
}

function leaveTarget() {
  connected = false;
  root = localFs;
  cwd = [];
  stopTrace();
  updatePrompt();
}

function kickOut() {
  leaveTarget();
  firewallDown = false;
  print('');
  print('!!! TRACE COMPLETE. CONNECTION TERMINATED !!!', 'line-err');
  print('Firewall rebuilt. Run crack and connect again.', 'line-err');
  msgBox('Connection Lost', 'The remote host traced you and dropped the connection.');
}

// ====== COMMANDS ======
const commands = {
  help: () => print(
    'Commands:\n  help, dir, cd <dir>, cat <file>, mkdir <name>, cls, ver\n  decrypt <b64>, hex <hex>, scan, ping <host>\n  crack <host:port>, connect <host:port>, exit\n  unlock <password>, spoof, whoami', 'line-sys'),

  ls: () => {
    const entries = Object.entries(getDir().children);
    if (!entries.length) return print('File not found', 'line-dim');
    entries.forEach(([k, v]) =>
      print(v.type === 'dir'
        ? `${k.padEnd(20)}<DIR>`
        : `${k.padEnd(20)}${String(v.content.length).padStart(6)} bytes`));
  },

  cd: ([target]) => {
    if (!target || target === '~' || target === '\\' || target === '/') { cwd = []; return updatePrompt(); }
    if (target === '..') { cwd.pop(); return updatePrompt(); }
    if (getDir().children[target]?.type === 'dir') { cwd.push(target); updatePrompt(); }
    else print('Invalid directory', 'line-err');
  },

  cat: ([file]) => {
    if (!file) return print('usage: cat <file>', 'line-err');
    const node = getDir().children[file];
    if (!node) return print('File not found - ' + file, 'line-err');
    if (node.type === 'dir') return print(`${file} is a directory`, 'line-err');
    print(node.content);
  },

  mkdir: ([name]) => {
    if (!name) return print('Required parameter missing', 'line-err');
    getDir().children[name] = { type: 'dir', children: {} };
    print(`Directory created: ${name}`, 'line-dim');
  },

  ver: () => print('\nMicrosoft Windows 98 [Version 4.10.2222]\nGhostOS Kernel 1.0\n', 'line-dim'),

  whoami: () => print('ghost (uid=1000) - root access: pending...', 'line-dim'),

  sudo: () => print('Bad command or file name. (Nice try, operator.)', 'line-err'),

  ping: async ([host]) => {
    if (!host) return print('usage: ping <host>', 'line-err');
    for (let i = 0; i < 3; i++) {
      await sleep(450);
      print(host === TARGET ? `Reply from ${host}: bytes=32 time=${(Math.random() * 20 + 5).toFixed(0)}ms TTL=64` : 'Request timed out.', host === TARGET ? 'line-sys' : 'line-err');
    }
  },

  decrypt: async ([str]) => {
    if (!str) return print('usage: decrypt <base64_string>', 'line-err');
    let decoded;
    try { decoded = atob(str); } catch { return print('decrypt: Invalid Base64 input', 'line-err'); }
    await typeLine(`DECODED PAYLOAD -> ${decoded}`, 'line-sys');
    if (decoded === 'SIDHARTH_ROOT_KEY' && !hasKey) {
      hasKey = true;
      await typeLine('[*] ROOT KEY ACQUIRED.', 'line-sys');
      await completeMission();
      print('Next: scan the network, then crack the firewall.', 'line-dim');
    }
  },

  hex: ([str]) => {
    if (!str || !/^([0-9a-fA-F]{2})+$/.test(str)) return print('usage: hex <hex_string>', 'line-err');
    let out = '';
    for (let i = 0; i < str.length; i += 2) out += String.fromCharCode(parseInt(str.slice(i, i + 2), 16));
    print(`HEX DECODED -> ${out}`, 'line-sys');
  },

  scan: async () => {
    await typeLine('Scanning local subnet...', 'line-sys');
    await sleep(500);
    print('192.168.1.1   [GATEWAY]', 'line-sys');
    await sleep(400);
    print('192.168.1.44  [TARGET-NODE // PORT 8080 OPEN]', 'line-sys');
  },

  crack: async ([addr]) => {
    if (!addr) return print('usage: crack <host:port>', 'line-err');
    if (![TARGET, `${TARGET}:8080`].includes(addr)) return print('crack: unknown host', 'line-err');
    if (!hasKey) return print('crack: root key required. Decode the payload first.', 'line-err');
    if (connected) return print('crack: you are already inside.', 'line-dim');
    await typeLine(`Attacking firewall on ${TARGET}:8080...`, 'line-sys');
    await progress('Bypassing firewall');
    await progress('Injecting root key ', 1800);
    firewallDown = true;
    await typeLine('[OK] FIREWALL DOWN. You can now connect.', 'line-sys');
  },

  connect: async ([addr]) => {
    if (!addr) return print('usage: connect <host:port>', 'line-err');
    if (![TARGET, `${TARGET}:8080`].includes(addr)) return print('connect: unknown host', 'line-err');
    if (!hasKey) return print('connect: access denied. Root key required.', 'line-err');
    if (!firewallDown) return print('connect: firewall blocking. Try: crack ' + TARGET + ':8080', 'line-err');
    if (connected) return print('connect: already connected.', 'line-dim');
    await typeLine('Dialing...', 'line-sys');
    await sleep(500);
    connected = true;
    root = remoteFs;
    cwd = [];
    updatePrompt();
    startTrace();
    await typeLine('[OK] CONNECTED to target node.', 'line-sys');
    await typeLine('[!] TRACE STARTED. Move fast or you get kicked out.', 'line-err');
    if (stage === 1) {
      await completeMission();
      print('Find the vault password. Hint: check the admin folder.', 'line-dim');
    }
  },

  spoof: () => {
    if (!connected) return print('spoof: not connected to a target.', 'line-err');
    if (spoofs <= 0) return print('spoof: no spoofs left.', 'line-err');
    spoofs--;
    trace = Math.max(0, trace - 30);
    updateTrace();
    print(`IP spoofed. Trace reduced. (${spoofs} left)`, 'line-sys');
  },

  unlock: async ([pw]) => {
    if (!connected) return print('unlock: nothing to unlock here.', 'line-err');
    if (!pw) return print('usage: unlock <password>', 'line-err');
    if (stage !== 2) return print('unlock: vault already empty.', 'line-dim');
    if (pw !== VAULT_PASSWORD) { trace = Math.min(99, trace + 10); updateTrace(); return print('ACCESS DENIED. Trace +10%', 'line-err'); }
    await progress('Decrypting vault');
    await typeLine('[*] VAULT OPEN. 1,337 BTC transferred to your wallet.', 'line-sys', 14);
    await completeMission();
    stopTrace();
    await typeLine('\n  +-------------------------+\n  |   YOU ARE THE GHOST.    |\n  +-------------------------+', 'line-sys', 6);
    leaveTarget();
    msgBox('Mission Complete', 'You emptied the vault and escaped the trace. All missions complete!');
  },

  exit: () => {
    if (!connected) return print('exit: not connected to a target.', 'line-err');
    leaveTarget();
    print('Connection closed. Back on your local node.', 'line-dim');
  },

  clear: () => { termOut.innerHTML = ''; }
};
commands.dir = commands.ls;
commands.cls = commands.clear;

// ====== INPUT ======
const history = [];
let hIdx = 0;

termIn.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' && history.length) {
    hIdx = Math.max(0, hIdx - 1);
    termIn.value = history[hIdx];
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    hIdx = Math.min(history.length, hIdx + 1);
    termIn.value = history[hIdx] ?? '';
    e.preventDefault();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const parts = termIn.value.split(/\s+/);
    const last = parts.pop();
    const pool = parts.length ? Object.keys(getDir().children) : Object.keys(commands);
    const matches = pool.filter(x => x.startsWith(last));
    if (matches.length === 1) termIn.value = [...parts, matches[0]].join(' ') + ' ';
  }
});

$('termForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  const raw = termIn.value.trim();
  termIn.value = '';
  if (!raw) return;
  history.push(raw);
  hIdx = history.length;
  print(`${promptLabel.textContent}${raw}`, 'line-dim');

  busy = true;
  termIn.disabled = true;
  for (const part of raw.split(';').map(s => s.trim()).filter(Boolean)) {
    const [cmd, ...args] = part.split(/\s+/);
    const name = cmd.toLowerCase();
    if (Object.hasOwn(commands, name)) await commands[name](args);
    else print('Bad command or file name', 'line-err');
  }
  busy = false;
  termIn.disabled = false;
  termIn.focus();
});

// ====== WINDOW MANAGER ======
const tasksEl = $('tasks');
const winMeta = {
  'win-terminal': { title: 'MS-DOS Prompt', icon: 'ico-dos', btn: null },
  'win-mission': { title: 'Missions - Notepad', icon: 'ico-note', btn: null }
};
let zTop = 10;

function refreshTasks() {
  for (const [id, m] of Object.entries(winMeta)) {
    if (m.btn) m.btn.classList.toggle('pressed', $(id).classList.contains('active'));
  }
}

function addTask(id) {
  const m = winMeta[id];
  const b = document.createElement('button');
  b.className = 'task';
  b.innerHTML = `<svg class="ico16"><use href="#${m.icon}"/></svg><span>${m.title}</span>`;
  b.onclick = () => {
    const w = $(id);
    if (w.classList.contains('minimized')) focusWin(id);
    else if (w.classList.contains('active')) minWin(id);
    else focusWin(id);
  };
  tasksEl.appendChild(b);
  m.btn = b;
}

function focusWin(id) {
  const w = $(id);
  w.classList.remove('minimized', 'hidden');
  if (!winMeta[id].btn) addTask(id);
  document.querySelectorAll('.window[id]').forEach(x => x.classList.remove('active'));
  w.classList.add('active');
  w.style.zIndex = ++zTop;
  refreshTasks();
  if (id === 'win-terminal' && !termIn.disabled) termIn.focus();
}

function openWin(id) { focusWin(id); }

function minWin(id) {
  const w = $(id);
  w.classList.add('minimized');
  w.classList.remove('active');
  refreshTasks();
}

function closeWin(id) {
  const w = $(id);
  w.classList.add('hidden');
  w.classList.remove('active');
  winMeta[id].btn?.remove();
  winMeta[id].btn = null;
}

Object.keys(winMeta).forEach(id => {
  const w = $(id);
  addTask(id);
  w.addEventListener('mousedown', () => { if (!w.classList.contains('active')) focusWin(id); });
  w.querySelector('[data-act=min]').onclick = () => minWin(id);
  w.querySelector('[data-act=max]').onclick = () => w.classList.toggle('max');
  w.querySelector('[data-act=close]').onclick = () => closeWin(id);

  const header = w.querySelector('.win-header');
  header.addEventListener('dblclick', e => { if (!e.target.closest('button')) w.classList.toggle('max'); });
  header.addEventListener('mousedown', e => {
    if (e.target.closest('button') || w.classList.contains('max')) return;
    const startX = e.clientX - w.offsetLeft;
    const startY = e.clientY - w.offsetTop;
    const onMove = ev => {
      w.style.left = Math.max(0, ev.clientX - startX) + 'px';
      w.style.top = Math.max(0, ev.clientY - startY) + 'px';
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
});

$('win-terminal').addEventListener('click', () => {
  if (!window.getSelection().toString()) termIn.focus();
});

// ====== DESKTOP ICONS ======
document.querySelectorAll('.icon').forEach(icon => {
  icon.addEventListener('click', e => {
    document.querySelectorAll('.icon').forEach(i => i.classList.remove('sel'));
    icon.classList.add('sel');
    e.stopPropagation();
  });
  icon.addEventListener('dblclick', () => {
    if (icon.dataset.open) openWin(icon.dataset.open);
  });
});
$('binIcon').addEventListener('dblclick', () =>
  msgBox('Recycle Bin', 'The Recycle Bin is empty. (Unlike your trace meter.)'));
$('desktop').addEventListener('mousedown', e => {
  if (e.target === $('desktop')) document.querySelectorAll('.icon').forEach(i => i.classList.remove('sel'));
});

// ====== START MENU ======
const startMenu = $('startMenu');
const startBtn = $('startBtn');

startBtn.addEventListener('click', () => {
  startMenu.classList.toggle('hidden');
  startBtn.classList.toggle('pressed', !startMenu.classList.contains('hidden'));
});
document.addEventListener('mousedown', e => {
  if (!e.target.closest('#startMenu') && !e.target.closest('#startBtn')) {
    startMenu.classList.add('hidden');
    startBtn.classList.remove('pressed');
  }
});
startMenu.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
  openWin(b.dataset.open);
  startMenu.classList.add('hidden');
  startBtn.classList.remove('pressed');
}));
$('smShutdown').addEventListener('click', () => {
  startMenu.classList.add('hidden');
  startBtn.classList.remove('pressed');
  msgBox('Shut Down Windows', 'Are you sure you want to shut down your computer?', [
    { label: 'Yes', fn: shutdown },
    { label: 'No' }
  ]);
});

function shutdown() {
  const off = document.createElement('div');
  off.id = 'offScreen';
  off.textContent = "It's now safe to turn off your computer.\n(click to restart)";
  off.style.whiteSpace = 'pre-line';
  off.onclick = () => location.reload();
  document.body.appendChild(off);
}

// ====== DIALOGS ======
function msgBox(title, text, buttons = [{ label: 'OK' }]) {
  const ov = document.createElement('div');
  ov.className = 'modal-ov';
  ov.innerHTML = `
    <div class="window dialog active">
      <div class="win-header"><div class="win-title"><span>${title}</span></div>
        <div class="win-btns"><button class="wbtn" data-x>&times;</button></div></div>
      <div class="dlg-body"><div class="dlg-ico">i</div><p>${text}</p></div>
      <div class="dlg-btns"></div>
    </div>`;
  const close = () => { ov.remove(); if (!termIn.disabled) termIn.focus(); };
  ov.querySelector('[data-x]').onclick = close;
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.onclick = () => { close(); b.fn?.(); };
    ov.querySelector('.dlg-btns').appendChild(btn);
  });
  document.body.appendChild(ov);
}

// ====== CLOCK ======
function tick() {
  $('osClock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
tick();
setInterval(tick, 1000);

// ====== BOOT ======
async function boot() {
  busy = true;
  termIn.disabled = true;
  updateBadge();
  renderMissions();
  updatePrompt();
  const lines = [
    ['Microsoft(R) Windows 98', 'line-dim'],
    ['   (C)Copyright Microsoft Corp 1981-1998.', 'line-dim'],
    ['', ''],
    ['GHOST_OS BIOS v1.0', 'line-sys'],
    ['Checking memory............ OK', 'line-sys'],
    ['Loading kernel modules..... OK', 'line-sys'],
    ['Spoofing MAC address....... OK', 'line-sys'],
    ['Connecting to Kerala node.. OK', 'line-sys'],
    ['', ''],
    ['Welcome, operator. Type "help" to begin.', 'line-sys']
  ];
  for (const [t, c] of lines) { await typeLine(t, c, 6); await sleep(90); }
  busy = false;
  termIn.disabled = false;
  termIn.focus();
}

window.addEventListener('load', () => {
  setTimeout(() => {
    $('bootScreen').classList.add('gone');
    setTimeout(() => {
      $('bootScreen').remove();
      focusWin('win-terminal');
      boot();
    }, 400);
  }, 2400);
});

// =====================================================================
//  EXTRA WINDOWS 98 FEATURES
//  Calculator, Snakes & Ladders, Display Properties (backgrounds + color
//  schemes), My Computer, right-click desktop menu
// =====================================================================

// ---------- icons ----------
document.querySelector('svg defs').insertAdjacentHTML('beforeend', `
  <symbol id="ico-calc" viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="26" fill="#c0c0c0" stroke="#000"/>
    <rect x="9" y="6" width="14" height="5" fill="#9fdf9f" stroke="#000"/>
    <path d="M10 15h3M15 15h3M20 15h3M10 20h3M15 20h3M20 20h3M10 25h3M15 25h3" stroke="#000080" stroke-width="2"/></symbol>
  <symbol id="ico-snl" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" fill="#f5e6a8" stroke="#000"/>
    <path d="M8 26L24 6M12 27L28 7" stroke="#8b5a00" stroke-width="2"/><path d="M11 22h6M15 17h6M19 12h6" stroke="#8b5a00"/>
    <path d="M7 8c8 0 2 8 9 8s4 8 10 8" fill="none" stroke="#2a9d2a" stroke-width="3"/></symbol>
  <symbol id="ico-disp" viewBox="0 0 32 32"><rect x="3" y="4" width="26" height="18" fill="#008080" stroke="#000" stroke-width="2"/>
    <rect x="11" y="24" width="10" height="3" fill="#808080"/><rect x="8" y="27" width="16" height="2" fill="#c0c0c0" stroke="#000"/>
    <rect x="7" y="8" width="10" height="6" fill="#c0c0c0" stroke="#000"/><rect x="7" y="8" width="10" height="2" fill="#000080"/></symbol>
  <symbol id="ico-pc" viewBox="0 0 32 32"><rect x="5" y="3" width="22" height="16" fill="#c0c0c0" stroke="#000"/>
    <rect x="8" y="6" width="16" height="10" fill="#008080" stroke="#000"/><rect x="4" y="21" width="24" height="7" fill="#c0c0c0" stroke="#000"/>
    <rect x="7" y="24" width="8" height="2" fill="#000"/></symbol>`);

// ---------- window factory ----------
function makeWindow(id, title, icon, w, h, top, left, inner, noResize) {
  const win = document.createElement('section');
  win.className = 'window hidden';
  win.id = id;
  win.style.cssText = `top:${top}px;left:${left}px;width:${w}px;height:${h}px;${noResize ? 'resize:none;' : ''}`;
  win.innerHTML = `
    <div class="win-header">
      <div class="win-title"><svg class="ico16"><use href="#${icon}"/></svg><span>${title}</span></div>
      <div class="win-btns">
        <button class="wbtn" data-act="min">_</button>
        <button class="wbtn" data-act="max">&#9633;</button>
        <button class="wbtn" data-act="close">&times;</button>
      </div>
    </div>${inner}`;
  $('desktop').appendChild(win);
  winMeta[id] = { title, icon, btn: null };
  win.addEventListener('mousedown', () => { if (!win.classList.contains('active')) focusWin(id); });
  win.querySelector('[data-act=min]').onclick = () => minWin(id);
  win.querySelector('[data-act=max]').onclick = () => win.classList.toggle('max');
  win.querySelector('[data-act=close]').onclick = () => closeWin(id);
  const header = win.querySelector('.win-header');
  header.addEventListener('dblclick', e => { if (!e.target.closest('button')) win.classList.toggle('max'); });
  header.addEventListener('mousedown', e => {
    if (e.target.closest('button') || win.classList.contains('max')) return;
    const sx = e.clientX - win.offsetLeft, sy = e.clientY - win.offsetTop;
    const mv = ev => { win.style.left = Math.max(0, ev.clientX - sx) + 'px'; win.style.top = Math.max(0, ev.clientY - sy) + 'px'; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  return win;
}

function addLaunchers(label, icon, action, startToo = true) {
  const ic = document.createElement('div');
  ic.className = 'icon';
  ic.innerHTML = `<svg class="ico32"><use href="#${icon}"/></svg><span>${label}</span>`;
  ic.addEventListener('click', e => {
    document.querySelectorAll('.icon').forEach(i => i.classList.remove('sel'));
    ic.classList.add('sel'); e.stopPropagation();
  });
  ic.addEventListener('dblclick', action);
  document.querySelector('.icons').appendChild(ic);
  if (!startToo) return;
  const b = document.createElement('button');
  b.innerHTML = `<svg class="ico32"><use href="#${icon}"/></svg>${label}`;
  b.onclick = () => { action(); startMenu.classList.add('hidden'); startBtn.classList.remove('pressed'); };
  const sm = document.querySelector('.sm-items');
  sm.insertBefore(b, sm.querySelector('hr'));
}

// =====================  CALCULATOR  =====================
makeWindow('win-calc', 'Calculator', 'ico-calc', 232, 300, 90, 420, `
  <div class="menubar"><span>Edit</span><span>View</span><span>Help</span></div>
  <div class="app-body"><div class="calc-lcd" id="calcLcd">0</div><div class="calc-grid" id="calcGrid"></div></div>`, true);

let cA = null, cOp = null, cCur = '0', cFresh = true;
const cFmt = v => typeof v === 'string' ? v : String(+v.toFixed(10));
const cDo = (a, b, op) => { a = +a; b = +b; return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? (b === 0 ? 'Error' : a / b) : b; };

function cKey(k) {
  if (cCur === 'Error' && k !== 'C') return;
  if (/^\d$/.test(k)) { cCur = (cFresh || cCur === '0') ? k : cCur + k; cFresh = false; }
  else if (k === '.') { if (cFresh) { cCur = '0.'; cFresh = false; } else if (!cCur.includes('.')) cCur += '.'; }
  else if (k === 'C') { cA = null; cOp = null; cCur = '0'; cFresh = true; }
  else if (k === '\u2190') { if (!cFresh) cCur = cCur.length > 1 ? cCur.slice(0, -1) : '0'; }
  else if (k === '\u00b1') { if (cCur !== '0') cCur = cCur.startsWith('-') ? cCur.slice(1) : '-' + cCur; }
  else if (k === '%') { cCur = cFmt(+cCur / 100); cFresh = true; }
  else {
    if (cOp && !cFresh) cCur = cFmt(cDo(cA, cCur, cOp));
    if (cCur === 'Error') { cA = null; cOp = null; cFresh = true; }
    else { cA = cCur; cOp = k === '=' ? null : k; cFresh = true; }
  }
  $('calcLcd').textContent = cCur.slice(0, 14);
}
['C', '\u2190', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '\u00b1', '0', '.', '='].forEach(k => {
  const b = document.createElement('button');
  b.textContent = k;
  if ('/*-+'.includes(k) || k === 'C') b.className = 'op';
  if (k === '=') b.className = 'eq';
  b.onclick = () => cKey(k);
  $('calcGrid').appendChild(b);
});
addLaunchers('Calculator', 'ico-calc', () => focusWin('win-calc'));

// =====================  SNAKES & LADDERS  =====================
makeWindow('win-snl', 'Snakes & Ladders', 'ico-snl', 396, 540, 24, 180, `
  <div class="app-body">
    <div class="snl-top">
      <div class="snl-dice" id="slDice">&#9856;</div>
      <button class="btn98x" id="slRoll">Roll Dice</button>
      <button class="btn98x" id="slNew">New Game</button>
      <span><b style="color:#0000ff">&#9679;</b> You &nbsp;<b style="color:#e00000">&#9679;</b> CPU</span>
    </div>
    <div class="snl-board" id="slBoard"><div class="snl-grid" id="slGrid"></div>
      <svg class="snl-svg" id="slSvg"></svg></div>
    <div class="snl-log" id="slLog"></div>
  </div>`);

const SNL = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100,
              16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
const FACES = ['\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];
const slCenter = n => { const r = Math.floor((n - 1) / 10); let c = (n - 1) % 10; if (r % 2) c = 9 - c; return [c * 36 + 18, (9 - r) * 36 + 18]; };
let slPos, slTurn, slBusy, slOver;
const slToks = [0, 1].map(i => {
  const t = document.createElement('div');
  t.className = 'snl-tok';
  t.style.background = i ? '#e00000' : '#0000ff';
  $('slBoard').appendChild(t);
  return t;
});
const slLog = t => { $('slLog').textContent = t; };

(function buildBoard() {
  const grid = $('slGrid');
  for (let r = 9; r >= 0; r--) for (let c = 0; c < 10; c++) {
    const n = r * 10 + (r % 2 === 0 ? c + 1 : 10 - c);
    const d = document.createElement('div');
    d.className = 'snl-cell ' + ((r + c) % 2 ? 'a' : 'b');
    if (n === 100) d.className += ' end';
    if (SNL[n]) d.className += SNL[n] > n ? ' lad' : ' snk';
    d.textContent = n;
    grid.appendChild(d);
  }
  const svg = $('slSvg');
  svg.setAttribute('viewBox', '0 0 360 360');
  svg.innerHTML = Object.entries(SNL).map(([a, b]) => {
    const [x1, y1] = slCenter(+a), [x2, y2] = slCenter(b);
    const up = b > +a;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${up ? '#2a8a2a' : '#c01818'}" stroke-width="${up ? 4 : 3}" stroke-linecap="round" stroke-dasharray="${up ? '' : '8 4'}" opacity=".55"/>`;
  }).join('');
})();

function slPlace(p) {
  const [x, y] = slCenter(Math.max(slPos[p], 1));
  const off = p ? 6 : -6;
  slToks[p].style.left = (x - 9 + off) + 'px';
  slToks[p].style.top = (y - 9 + off) + 'px';
}
function slUi() { $('slRoll').disabled = slBusy || slOver || slTurn !== 0; }

function slReset() {
  slPos = [0, 0]; slTurn = 0; slBusy = false; slOver = false;
  slPlace(0); slPlace(1);
  $('slDice').textContent = FACES[5];
  slLog('Your turn. Roll a 6 to go again! Reach 100 exactly to win.');
  slUi();
}

async function slPlay(p) {
  slBusy = true; slUi();
  const who = p ? 'CPU' : 'You';
  let d = 1;
  for (let i = 0; i < 8; i++) { d = 1 + Math.floor(Math.random() * 6); $('slDice').textContent = FACES[d - 1]; await sleep(70); }
  const target = slPos[p] + d;
  slLog(`${who} rolled a ${d}.`);
  if (target <= 100) {
    while (slPos[p] < target) { slPos[p]++; slPlace(p); await sleep(150); }
    if (SNL[target]) {
      await sleep(300);
      const to = SNL[target];
      slPos[p] = to; slPlace(p);
      slLog(to > target ? `${who} climbed a ladder to ${to}!` : `${who} got bitten by a snake! Down to ${to}.`);
      await sleep(450);
    }
  } else {
    slLog(`${who} rolled a ${d} but needs an exact roll.`);
    await sleep(500);
  }
  if (slPos[p] === 100) {
    slOver = true; slBusy = false; slUi();
    slLog(`${who} reached 100!`);
    msgBox('Snakes & Ladders', p ? 'The CPU reached 100 first. Better luck next time!' : 'You reached 100 and won the game!');
    return;
  }
  slTurn = d === 6 ? p : 1 - p;
  slBusy = false; slUi();
  if (slTurn === 1 && !slOver) setTimeout(() => slPlay(1), 700);
}
$('slRoll').onclick = () => { if (!slBusy && !slOver && slTurn === 0) slPlay(0); };
$('slNew').onclick = slReset;
slReset();
addLaunchers('Snakes & Ladders', 'ico-snl', () => focusWin('win-snl'));

// =====================  DISPLAY PROPERTIES  =====================
const WALLS = [
  ['Windows Teal (default)', '#008080'], ['Navy', '#000080'], ['Black', '#000000'], ['Maroon', '#800000'],
  ['Forest', '#0b4d2a'], ['Purple', '#4b0082'],
  ['Clouds', 'linear-gradient(#4a8fe0, #cfe6ff 65%, #ffffff)'],
  ['Sunset', 'linear-gradient(#1a0b3d, #c2185b 55%, #ff9800)'],
  ['Matrix Rain', 'repeating-linear-gradient(90deg, #001a00 0 6px, #003300 6px 12px)'],
  ['Checker', 'repeating-conic-gradient(#008080 0 25%, #006a6a 0 50%) 0 0 / 24px 24px']
];
const SCHEMES = {
  'Windows Standard': ['#000080', '#1084d0'], 'Rose': ['#5c2a46', '#c96f9c'], 'Brick': ['#5a1a1a', '#b5503c'],
  'Desert': ['#5e4e22', '#c9b26b'], 'Hot Dog Stand': ['#c00000', '#ffcc00'], 'Matrix': ['#002800', '#00a800']
};
let cfg = { bg: 0, custom: null, scheme: 'Windows Standard' };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('ghost98') || '{}')); } catch {}
const bgOf = c => c.custom || (WALLS[c.bg] || WALLS[0])[1];
function applyCfg(c) {
  document.body.style.background = bgOf(c);
  const [a, b] = SCHEMES[c.scheme] || SCHEMES['Windows Standard'];
  document.documentElement.style.setProperty('--navy', a);
  document.documentElement.style.setProperty('--blue', b);
}
applyCfg(cfg);

makeWindow('win-disp', 'Display Properties', 'ico-disp', 330, 470, 40, 330, `
  <div class="menubar"><span>Background</span><span>Appearance</span></div>
  <div class="app-body">
    <div class="dp-mon"><div class="dp-prev" id="dpPrev"></div></div>
    <fieldset><legend>Wallpaper / Background</legend>
      <div class="dp-list" id="dpList"></div>
      <div class="dp-row"><span>Custom color:</span><input type="color" id="dpColor" value="#008080"></div>
    </fieldset>
    <fieldset><legend>Window color scheme</legend>
      <div class="dp-row" style="margin-top:0"><select id="dpScheme"></select></div>
    </fieldset>
    <div class="dlg-btns"><button id="dpOk">OK</button><button id="dpCancel">Cancel</button><button id="dpApply">Apply</button></div>
  </div>`, true);

let draft = { ...cfg };
function dpDraw() {
  $('dpPrev').style.background = bgOf(draft);
  const [a] = SCHEMES[draft.scheme];
  $('dpPrev').style.setProperty('--navy', a);
  [...$('dpList').children].forEach((el, i) => el.classList.toggle('sel', !draft.custom && i === draft.bg));
  $('dpScheme').value = draft.scheme;
}
WALLS.forEach(([name], i) => {
  const d = document.createElement('div');
  d.className = 'dp-item';
  d.textContent = name;
  d.onclick = () => { draft.bg = i; draft.custom = null; dpDraw(); };
  $('dpList').appendChild(d);
});
Object.keys(SCHEMES).forEach(n => { const o = document.createElement('option'); o.textContent = n; $('dpScheme').appendChild(o); });
$('dpScheme').onchange = e => { draft.scheme = e.target.value; dpDraw(); };
$('dpColor').oninput = e => { draft.custom = e.target.value; dpDraw(); };
const dpSave = () => { cfg = { ...draft }; applyCfg(cfg); try { localStorage.setItem('ghost98', JSON.stringify(cfg)); } catch {} };
$('dpApply').onclick = dpSave;
$('dpOk').onclick = () => { dpSave(); closeWin('win-disp'); };
$('dpCancel').onclick = () => { draft = { ...cfg }; dpDraw(); closeWin('win-disp'); };
dpDraw();
const openDisp = () => { draft = { ...cfg }; dpDraw(); focusWin('win-disp'); };
addLaunchers('Display Properties', 'ico-disp', openDisp);

// =====================  MY COMPUTER  =====================
addLaunchers('My Computer', 'ico-pc', () => msgBox('System Properties',
  'GhostOS 98 (4.10.2222)<br>Registered to: Operator<br>Processor: Pentium II 266 MHz<br>RAM: 64.0 MB<br>Drive C: 2.1 GB free'), false);
// move My Computer to top of desktop icons
{ const icons = document.querySelector('.icons'); icons.insertBefore(icons.lastElementChild, icons.firstElementChild); }

// =====================  RIGHT-CLICK DESKTOP MENU  =====================
const ctx = document.createElement('div');
ctx.id = 'ctx';
ctx.className = 'hidden';
ctx.innerHTML = `<button data-a="prop">Properties</button><button data-a="dos">MS-DOS Prompt</button><button data-a="calc">Calculator</button><hr><button data-a="ref">Refresh</button>`;
document.body.appendChild(ctx);
$('desktop').addEventListener('contextmenu', e => {
  if (e.target.closest('.window')) return;
  e.preventDefault();
  ctx.style.left = Math.min(e.clientX, innerWidth - 170) + 'px';
  ctx.style.top = Math.min(e.clientY, innerHeight - 130) + 'px';
  ctx.classList.remove('hidden');
});
document.addEventListener('mousedown', e => { if (!e.target.closest('#ctx')) ctx.classList.add('hidden'); });
ctx.addEventListener('click', e => {
  const a = e.target.dataset.a;
  if (!a) return;
  ctx.classList.add('hidden');
  if (a === 'prop') openDisp();
  if (a === 'dos') focusWin('win-terminal');
  if (a === 'calc') focusWin('win-calc');
  if (a === 'ref') {
    const ic = document.querySelector('.icons');
    ic.style.visibility = 'hidden';
    setTimeout(() => { ic.style.visibility = ''; }, 150);
  }
});

// =====================================================================
//  PART 3: Sounds, Paint, Minesweeper, Task Manager, Run, Screensaver,
//  Blue Screen of Death, Clippy helper
// =====================================================================
(() => {
  // ---------- SOUND ----------
  let AC = null, muted = false;
  function tone(f, d = 0.15, type = 'square', v = 0.05, when = 0) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain(), s = AC.currentTime + when;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(0.0001, s + d);
      o.connect(g); g.connect(AC.destination); o.start(s); o.stop(s + d);
    } catch {}
  }
  const chime = () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .45, 'sine', .08, i * .13));
  const ding = () => { tone(440, .18, 'triangle', .1); tone(330, .25, 'triangle', .1, .12); };
  const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, 'square', .05, i * .1));

  const spk = document.createElement('span');
  spk.id = 'spk'; spk.title = 'Volume'; spk.textContent = '\uD83D\uDD0A';
  spk.onclick = () => { muted = !muted; spk.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'; if (!muted) ding(); };
  $('osClock').parentElement.insertBefore(spk, $('osClock'));

  document.addEventListener('pointerdown', () => chime(), { once: true });
  const _msgBox = msgBox;
  msgBox = function (...a) { ding(); return _msgBox(...a); };
  const _cm = completeMission;
  completeMission = async function () { fanfare(); return _cm(); };

  // ---------- icons ----------
  document.querySelector('svg defs').insertAdjacentHTML('beforeend', `
    <symbol id="ico-paint" viewBox="0 0 32 32"><rect x="3" y="4" width="26" height="22" fill="#fff" stroke="#000"/>
      <circle cx="10" cy="11" r="3" fill="#f00"/><circle cx="18" cy="9" r="3" fill="#0a0"/><circle cx="22" cy="17" r="3" fill="#00f"/>
      <path d="M6 24L24 6" stroke="#8b5a00" stroke-width="3"/><path d="M5 26l3-1-2-2z" fill="#000"/></symbol>
    <symbol id="ico-mine" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" fill="#c0c0c0" stroke="#808080"/>
      <circle cx="16" cy="16" r="6" fill="#000"/><path d="M16 6v20M6 16h20M9 9l14 14M23 9L9 23" stroke="#000"/>
      <rect x="13" y="13" width="3" height="3" fill="#fff"/></symbol>`);

  const startItem = (label, icon, action) => {
    const b = document.createElement('button');
    b.innerHTML = `<svg class="ico32"><use href="#${icon}"/></svg>${label}`;
    b.onclick = () => { action(); startMenu.classList.add('hidden'); startBtn.classList.remove('pressed'); };
    const sm = document.querySelector('.sm-items');
    sm.insertBefore(b, sm.querySelector('hr'));
  };

  // =====================  PAINT  =====================
  const PW = 480, PH = 290;
  makeWindow('win-paint', 'untitled - Paint', 'ico-paint', 590, 440, 20, 130, `
    <div class="menubar"><span>File</span><span>Edit</span><span>View</span><span>Image</span><span>Help</span></div>
    <div class="paint">
      <div class="p-tools" id="pTools"></div>
      <div class="p-main">
        <div class="p-wrap"><canvas id="pCv" width="${PW}" height="${PH}"></canvas></div>
        <div class="p-bottom">
          <div class="p-cur" id="pCur"></div><div class="p-pal" id="pPal"></div>
          <select id="pSize"><option>1</option><option selected>2</option><option>4</option><option>8</option><option>14</option></select>
          <button class="btn98x" id="pClr">Clear</button><button class="btn98x" id="pSave">Save PNG</button>
        </div>
      </div>
    </div>`);
  const cv = $('pCv'), pc = cv.getContext('2d');
  pc.fillStyle = '#fff'; pc.fillRect(0, 0, PW, PH);
  pc.lineCap = 'round'; pc.lineJoin = 'round';
  let tool = 'pencil', color = '#000000', drawing = false, sx = 0, sy = 0, snap = null;
  const TOOLS = [['pencil', '\u270F\uFE0F'], ['brush', '\uD83D\uDD8C\uFE0F'], ['eraser', '\uD83E\uDDFD'], ['fill', '\uD83E\uDEA3'], ['line', '\u2571'], ['rect', '\u25AD']];
  TOOLS.forEach(([n, ic]) => {
    const b = document.createElement('button');
    b.className = 'p-tool' + (n === tool ? ' on' : ''); b.textContent = ic; b.title = n;
    b.onclick = () => { tool = n; document.querySelectorAll('.p-tool').forEach(x => x.classList.toggle('on', x === b)); };
    $('pTools').appendChild(b);
  });
  ['#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080',
   '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'].forEach(c => {
    const s = document.createElement('div');
    s.className = 'p-sw'; s.style.background = c;
    s.onclick = () => { color = c; $('pCur').style.background = c; };
    $('pPal').appendChild(s);
  });
  const xy = e => { const r = cv.getBoundingClientRect(); return [Math.floor(e.clientX - r.left), Math.floor(e.clientY - r.top)]; };
  function flood(x, y) {
    const img = pc.getImageData(0, 0, PW, PH), d = img.data;
    const i0 = (y * PW + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2]];
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    if (t[0] === r && t[1] === g && t[2] === b) return;
    const st = [[x, y]];
    while (st.length) {
      const [px, py] = st.pop();
      if (px < 0 || py < 0 || px >= PW || py >= PH) continue;
      const i = (py * PW + px) * 4;
      if (d[i] !== t[0] || d[i + 1] !== t[1] || d[i + 2] !== t[2]) continue;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    pc.putImageData(img, 0, 0);
  }
  const pSize = () => +$('pSize').value;
  function style() {
    pc.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    pc.lineWidth = tool === 'pencil' ? 1 : tool === 'eraser' ? pSize() * 4 : pSize();
  }
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    [sx, sy] = xy(e);
    if (tool === 'fill') { flood(sx, sy); return; }
    drawing = true; style();
    snap = pc.getImageData(0, 0, PW, PH);
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      pc.beginPath(); pc.moveTo(sx, sy); pc.lineTo(sx + 0.01, sy + 0.01); pc.stroke();
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const [x, y] = xy(e);
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') { pc.lineTo(x, y); pc.stroke(); }
    else {
      pc.putImageData(snap, 0, 0); style(); pc.beginPath();
      if (tool === 'line') { pc.moveTo(sx, sy); pc.lineTo(x, y); }
      else pc.rect(sx, sy, x - sx, y - sy);
      pc.stroke();
    }
  });
  const pEnd = () => { drawing = false; };
  cv.addEventListener('pointerup', pEnd); cv.addEventListener('pointercancel', pEnd);
  $('pClr').onclick = () => { pc.fillStyle = '#fff'; pc.fillRect(0, 0, PW, PH); };
  $('pSave').onclick = () => { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'ghost_paint.png'; a.click(); };

  // =====================  MINESWEEPER  =====================
  const W = 9, H = 9, MINES = 10;
  makeWindow('win-mines', 'Minesweeper', 'ico-mine', 262, 340, 40, 300, `
    <div class="app-body">
      <div class="ms-top"><div class="ms-lcd" id="msMines">010</div><button class="ms-face" id="msFace">\uD83D\uDE42</button><div class="ms-lcd" id="msTime">000</div></div>
      <div class="ms-grid" id="msGrid"></div>
    </div>`, true);
  let board, over, started, flags, secs, msT;
  const grid = $('msGrid');
  const NC = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000', '#808080'];
  const p3 = n => String(Math.max(0, Math.min(999, n))).padStart(3, '0');
  const near = i => {
    const x = i % W, y = Math.floor(i / W), o = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) o.push(ny * W + nx);
    }
    return o;
  };
  function msReset() {
    clearInterval(msT);
    board = Array.from({ length: W * H }, () => ({ m: false, o: false, f: false, n: 0 }));
    over = false; started = false; flags = 0; secs = 0;
    $('msFace').textContent = '\uD83D\uDE42'; $('msTime').textContent = '000'; $('msMines').textContent = p3(MINES);
    grid.innerHTML = '';
    board.forEach((_, i) => {
      const c = document.createElement('button');
      c.className = 'ms-cell';
      c.onclick = () => msOpen(i);
      c.oncontextmenu = e => { e.preventDefault(); msFlag(i); };
      grid.appendChild(c);
    });
  }
  function msDraw(i) {
    const c = grid.children[i], d = board[i];
    c.className = 'ms-cell' + (d.o ? ' open' : '');
    c.textContent = d.o ? (d.m ? '\uD83D\uDCA3' : d.n || '') : d.f ? '\uD83D\uDEA9' : '';
    c.style.color = d.o && d.n ? NC[d.n] : '';
  }
  function msOpen(i) {
    if (over || board[i].o || board[i].f) return;
    if (!started) {
      started = true;
      let n = 0;
      while (n < MINES) { const r = Math.floor(Math.random() * W * H); if (r === i || board[r].m || near(i).includes(r)) continue; board[r].m = true; n++; }
      board.forEach((c, k) => c.n = near(k).filter(j => board[j].m).length);
      msT = setInterval(() => { secs++; $('msTime').textContent = p3(secs); }, 1000);
    }
    const st = [i];
    while (st.length) {
      const k = st.pop(), d = board[k];
      if (d.o || d.f) continue;
      d.o = true; msDraw(k);
      if (d.m) {
        over = true; clearInterval(msT); $('msFace').textContent = '\uD83D\uDE35';
        board.forEach((c, j) => { if (c.m) { c.o = true; msDraw(j); } });
        grid.children[k].classList.add('boom');
        return;
      }
      if (d.n === 0) st.push(...near(k));
    }
    if (board.filter(c => c.o).length === W * H - MINES) {
      over = true; clearInterval(msT); $('msFace').textContent = '\uD83D\uDE0E';
      fanfare(); msgBox('Minesweeper', `You cleared the field in ${secs} seconds!`);
    }
  }
  function msFlag(i) {
    if (over || board[i].o) return;
    board[i].f = !board[i].f; flags += board[i].f ? 1 : -1;
    $('msMines').textContent = p3(MINES - flags); msDraw(i);
  }
  $('msFace').onclick = msReset;
  msReset();

  // =====================  TASK MANAGER  =====================
  makeWindow('win-tm', 'Windows Task Manager', 'ico-pc', 340, 390, 50, 260, `
    <div class="menubar"><span>File</span><span>Options</span><span>View</span><span>Help</span></div>
    <div class="app-body">
      <div style="margin-bottom:4px"><b>Applications</b></div>
      <div class="tm-list" id="tmList"></div>
      <div class="dlg-btns" style="justify-content:flex-end;padding-top:0"><button id="tmEnd">End Task</button><button id="tmSw">Switch To</button><button id="tmNew">New Task...</button></div>
      <div class="tm-stat">CPU Usage: <b id="tmCpu">3%</b> &nbsp; Tasks: <b id="tmN">0</b> &nbsp; Trace: <b id="tmTr">--</b></div>
    </div>`, true);
  let tmSel = null;
  function tmDraw() {
    if ($('win-tm').classList.contains('hidden')) return;
    const rows = Object.entries(winMeta).filter(([id]) => id !== 'win-tm' && !$(id).classList.contains('hidden'));
    const list = $('tmList'); list.innerHTML = '';
    rows.forEach(([id, m]) => {
      const d = document.createElement('div');
      d.className = 'tm-row' + (id === tmSel ? ' sel' : '');
      const a = document.createElement('span'), b = document.createElement('span');
      a.textContent = m.title; b.textContent = $(id).classList.contains('minimized') ? 'Minimized' : 'Running';
      d.append(a, b); d.onclick = () => { tmSel = id; tmDraw(); };
      list.appendChild(d);
    });
    $('tmN').textContent = rows.length;
    $('tmCpu').textContent = (busy ? 40 + Math.floor(Math.random() * 40) : 1 + Math.floor(Math.random() * 6)) + '%';
    $('tmTr').textContent = connected ? Math.floor(trace) + '%' : '--';
  }
  setInterval(tmDraw, 700);
  $('tmEnd').onclick = () => { if (tmSel && winMeta[tmSel]) { closeWin(tmSel); tmSel = null; tmDraw(); } };
  $('tmSw').onclick = () => { if (tmSel) focusWin(tmSel); };
  const openTm = () => { focusWin('win-tm'); tmDraw(); };
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && (e.key === 'Delete' || e.key === 'End')) { e.preventDefault(); openTm(); } });

  // =====================  RUN DIALOG + PROGRAM LAUNCHER  =====================
  const PROGS = {
    cmd: () => focusWin('win-terminal'), command: () => focusWin('win-terminal'), msdos: () => focusWin('win-terminal'),
    calc: () => focusWin('win-calc'), calculator: () => focusWin('win-calc'),
    paint: () => focusWin('win-paint'), mspaint: () => focusWin('win-paint'),
    winmine: () => focusWin('win-mines'), minesweeper: () => focusWin('win-mines'),
    snakes: () => focusWin('win-snl'), snl: () => focusWin('win-snl'),
    notepad: () => focusWin('win-mission'), missions: () => focusWin('win-mission'),
    control: () => openDisp(), desk: () => openDisp(), display: () => openDisp(),
    taskmgr: openTm
  };
  function runProg(name) {
    const n = (name || '').trim().toLowerCase().replace(/\.(exe|com|cpl)$/, '');
    if (Object.hasOwn(PROGS, n)) { PROGS[n](); return true; }
    return false;
  }
  makeWindow('win-run', 'Run', 'ico-dos', 360, 170, 180, 300, `
    <div class="app-body" style="margin-top:3px">
      <div style="display:flex;gap:10px;align-items:center"><svg class="ico32"><use href="#ico-dos"/></svg>
      <span>Type the name of a program, and Windows will open it for you.<br>Try: cmd, calc, paint, winmine, snakes, control, taskmgr</span></div>
      <input class="run-in" id="runIn" autocomplete="off" spellcheck="false">
      <div class="dlg-btns" style="padding:0"><button id="runOk">OK</button><button id="runCancel">Cancel</button></div>
    </div>`, true);
  const runGo = () => {
    const v = $('runIn').value;
    closeWin('win-run');
    $('runIn').value = '';
    if (v.trim() && !runProg(v)) msgBox('Run', `Cannot find the file '${v.trim()}' (or one of its components). Make sure the path and filename are correct.`);
  };
  $('runOk').onclick = runGo;
  $('runCancel').onclick = () => closeWin('win-run');
  $('runIn').addEventListener('keydown', e => { if (e.key === 'Enter') runGo(); if (e.key === 'Escape') closeWin('win-run'); });
  const openRun = () => { focusWin('win-run'); $('runIn').focus(); };
  $('tmNew').onclick = openRun;

  // terminal <-> desktop bridge
  commands.start = ([n]) => {
    if (!n) return print('usage: start <program>   (cmd, calc, paint, winmine, snakes, control, taskmgr)', 'line-err');
    if (!runProg(n)) print(`start: cannot find '${n}'`, 'line-err');
  };
  commands.bsod = () => bsod();
  commands.format = async ([d]) => {
    if (!d) return print('usage: format c:', 'line-err');
    await typeLine('WARNING: ALL DATA ON NON-REMOVABLE DISK DRIVE C: WILL BE LOST!', 'line-err', 12);
    await sleep(700);
    await progress('Formatting 2,147 MB', 1800);
    bsod();
  };
  const _help = commands.help;
  commands.help = () => { _help(); print('  start <app>, bsod, format c:\n  (apps: cmd calc paint winmine snakes control taskmgr)', 'line-sys'); };

  // =====================  BLUE SCREEN  =====================
  const bs = document.createElement('div');
  bs.id = 'bsod'; bs.className = 'hidden';
  bs.innerHTML = `<div style="text-align:center"><b>Windows</b></div><br>A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) +
00010E36. The current application will be terminated.

*  Press any key to terminate the current application.
*  Press CTRL+ALT+DEL again to restart your computer. You will
   lose any unsaved information in all applications.

<div style="text-align:center">Press any key to continue _</div>`;
  document.body.appendChild(bs);
  let bsAt = 0;
  function bsod() { bs.classList.remove('hidden'); bsAt = Date.now(); tone(120, .6, 'sawtooth', .08); }
  const bsOff = () => { if (!bs.classList.contains('hidden') && Date.now() - bsAt > 800) { bs.classList.add('hidden'); if (!termIn.disabled) termIn.focus(); } };
  document.addEventListener('keydown', bsOff); document.addEventListener('mousedown', bsOff);

  // =====================  SCREENSAVER  =====================
  const ss = document.createElement('canvas');
  ss.id = 'ss'; ss.className = 'hidden';
  document.body.appendChild(ss);
  let ssOn = false, ssRaf = 0, ssStarted = 0, idle = 0, stars = [];
  function ssRun() {
    const g = ss.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, ss.width, ss.height);
    const cx = ss.width / 2, cy = ss.height / 2;
    stars.forEach(s => {
      s.z -= 8; if (s.z < 1) { s.x = (Math.random() - .5) * ss.width; s.y = (Math.random() - .5) * ss.height; s.z = ss.width; }
      const k = 256 / s.z, px = cx + s.x * k, py = cy + s.y * k, r = Math.max(.5, (1 - s.z / ss.width) * 3);
      g.fillStyle = '#fff'; g.fillRect(px, py, r, r);
    });
    ssRaf = requestAnimationFrame(ssRun);
  }
  function ssStart() {
    if (ssOn || connected) return;
    ssOn = true; ssStarted = Date.now();
    ss.width = innerWidth; ss.height = innerHeight;
    stars = Array.from({ length: 220 }, () => ({ x: (Math.random() - .5) * ss.width, y: (Math.random() - .5) * ss.height, z: Math.random() * ss.width }));
    ss.classList.remove('hidden');
    ssRun();
  }
  function ssStop() { ssOn = false; cancelAnimationFrame(ssRaf); ss.classList.add('hidden'); }
  const wake = e => {
    if (ssOn && (e.type !== 'mousemove' || Date.now() - ssStarted > 600)) ssStop();
    idle = 0;
  };
  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, wake, true));
  setInterval(() => { if (!ssOn && ++idle >= 45) ssStart(); }, 1000);

  // =====================  CLIPPY  =====================
  const clip = document.createElement('div');
  clip.id = 'clippy';
  clip.innerHTML = `<div class="cl-bub hidden" id="clBub"><button class="cl-x" id="clX">&times;</button><div id="clTxt"></div></div><div class="cl-body" id="clBody">\uD83D\uDCCE</div>`;
  document.body.appendChild(clip);
  const HINTS = [
    'It looks like you are trying to hack a server! Try: cd missions, then cat target_01.enc, then decrypt followed by the text you see.',
    'Nice decoding! Now type scan, then crack 192.168.1.44:8080 and connect 192.168.1.44:8080. The trace starts when you connect!',
    'You are inside! Look in the admin folder. That password is hex, so use the hex command on it, then unlock <password>. Use spoof if the trace gets high!',
    'You emptied the vault! Want to relax? Try Paint, Minesweeper or Snakes & Ladders from the Start menu.'
  ];
  const clSay = (t = HINTS[Math.min(stage, 3)]) => { $('clTxt').textContent = t; $('clBub').classList.remove('hidden'); };
  $('clX').onclick = () => $('clBub').classList.add('hidden');
  $('clBody').onclick = () => $('clBub').classList.contains('hidden') ? clSay() : $('clBub').classList.add('hidden');
  let clStage = -1;
  setInterval(() => { if (stage !== clStage && !busy && !$('bootScreen')) { clStage = stage; clSay(); } }, 1500);

  // ---------- launchers ----------
  addLaunchers('Paint', 'ico-paint', () => focusWin('win-paint'));
  addLaunchers('Minesweeper', 'ico-mine', () => focusWin('win-mines'));
  startItem('Run...', 'ico-dos', openRun);
  startItem('Task Manager', 'ico-pc', openTm);
  const cm = $('ctx');
  if (cm) { const b = document.createElement('button'); b.dataset.a = 'tm'; b.textContent = 'Task Manager'; cm.insertBefore(b, cm.querySelector('hr')); cm.addEventListener('click', e => { if (e.target.dataset.a === 'tm') openTm(); }); }
})();