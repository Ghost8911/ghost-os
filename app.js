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