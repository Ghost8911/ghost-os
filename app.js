// Virtual Filesystem
const fs = {
  type: 'dir',
  children: {
    readme: { type: 'file', content: 'GhostOS Kernel 1.0 initialized.\nType "help" for available commands.' },
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

let cwd = [];
const termOut = document.getElementById('termOut');
const termIn = document.getElementById('termIn');
const promptLabel = document.getElementById('promptLabel');

function getDir(pathArr = cwd) {
  let node = fs;
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

function updatePrompt() {
  promptLabel.textContent = `ghost@node:~${cwd.length ? '/' + cwd.join('/') : ''}$`;
}

const commands = {
  help: () => print('Commands: help, ls, cd <dir>, cat <file>, mkdir <name>, decrypt <b64>, scan, clear', 'line-sys'),
  ls: () => {
    const dir = getDir();
    const items = Object.entries(dir.children).map(([k, v]) => v.type === 'dir' ? `[${k}/]` : k);
    print(items.length ? items.join('   ') : '(empty)');
  },
  cd: ([target]) => {
    if (!target || target === '~') { cwd = []; return updatePrompt(); }
    if (target === '..') { cwd.pop(); return updatePrompt(); }
    const dir = getDir();
    if (dir.children[target]?.type === 'dir') {
      cwd.push(target);
      updatePrompt();
    } else {
      print(`cd: ${target}: No such directory`, 'line-err');
    }
  },
  cat: ([file]) => {
    const dir = getDir();
    const node = dir.children[file];
    if (!node) return print(`cat: ${file}: File not found`, 'line-err');
    if (node.type === 'dir') return print(`cat: ${file}: Is a directory`, 'line-err');
    print(node.content);
  },
  mkdir: ([name]) => {
    if (!name) return print('usage: mkdir <folder_name>', 'line-err');
    getDir().children[name] = { type: 'dir', children: {} };
    print(`Created directory: ${name}`, 'line-dim');
  },
  decrypt: ([str]) => {
    if (!str) return print('usage: decrypt <base64_string>', 'line-err');
    try {
      const decoded = atob(str);
      print(`DECODED PAYLOAD -> ${decoded}`, 'line-sys');
      if (decoded === 'SIDHARTH_ROOT_KEY') {
        document.getElementById('missionBadge').textContent = 'MISSION 01: COMPLETE ✓';
        print('[★] ACCESS GRANTED! Mission 01 complete.', 'line-sys');
      }
    } catch {
      print('decrypt: Invalid Base64 input', 'line-err');
    }
  },
  scan: () => print('Scanning local subnet...\n192.168.1.1   [GATEWAY]\n192.168.1.44  [TARGET-NODE // PORT 8080 OPEN]', 'line-sys'),
  clear: () => { termOut.innerHTML = ''; }
};

document.getElementById('termForm').addEventListener('submit', e => {
  e.preventDefault();
  const raw = termIn.value.trim();
  termIn.value = '';
  if (!raw) return;
  print(`${promptLabel.textContent} ${raw}`, 'line-dim');
  const [cmd, ...args] = raw.split(/\s+/);
  if (commands[cmd]) commands[cmd](args);
  else print(`${cmd}: command not found (type "help")`, 'line-err');
});

// Window Dragging & Focus
let zTop = 10;
document.querySelectorAll('.window').forEach(win => {
  win.addEventListener('mousedown', () => {
    document.querySelectorAll('.window').forEach(w => w.classList.remove('active'));
    win.classList.add('active');
    win.style.zIndex = ++zTop;
  });
});

document.querySelectorAll('[data-drag]').forEach(bar => {
  bar.addEventListener('mousedown', e => {
    const win = document.getElementById(bar.dataset.drag);
    const startX = e.clientX - win.offsetLeft;
    const startY = e.clientY - win.offsetTop;
    const onMove = ev => {
      win.style.left = Math.max(0, ev.clientX - startX) + 'px';
      win.style.top = Math.max(0, ev.clientY - startY) + 'px';
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
});

function toggleWin(id) {
  document.getElementById(id).classList.toggle('hidden');
}

setInterval(() => {
  document.getElementById('osClock').textContent = new Date().toLocaleTimeString();
}, 1000);

print('GhostOS v1.0 [TTY1] — Type "help" to begin.', 'line-sys');