// ╔══════════════════════════════════════════════════════════════════════════╗
// ║            TICKET GENERATOR  MASTER v1.0                                 ║
// ║                  Gabriel Perdigão                                        ║
// ║  ─────────────────────────────────────────────────────                   ║
// ║  • Janela FIXA 500×700 — não redimensionável, apenas movível             ║
// ║  • Emitente salvo em prefs; demais campos NULL até preenchimento         ║
// ║  • DeepSeek self-hosted via .env (DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL)  ║
// ║  • Fallback offline total — sem internet funciona normalmente            ║
// ║  • Audit log + Tickets DB locais                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard, shell } = require('electron');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ── .env loader (multi-path) ─────────────────────────────────────────────────
try {
  const envCandidates = [
    path.join(path.dirname(process.execPath), '.env'),
    path.join(app.getPath('userData'), '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '.env'),
  ];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) { require('dotenv').config({ path: p }); break; }
  }
} catch (_) {}

// ── Config ────────────────────────────────────────────────────────────────────
const DEEPSEEK_KEY    = process.env.DEEPSEEK_API_KEY   || '';
const DEEPSEEK_MODEL  = process.env.DEEPSEEK_MODEL     || 'deepseek-chat';
// Self-hosted: defina DEEPSEEK_BASE_URL=http://localhost:11434 (Ollama) ou similar
const DEEPSEEK_BASE   = process.env.DEEPSEEK_BASE_URL  || 'https://api.deepseek.com';
const APP_VERSION     = '1.0.0';

// ── Storage paths ─────────────────────────────────────────────────────────────
const USER_DATA   = app.getPath('userData');
const AUDIT_FILE  = path.join(USER_DATA, 'audit_log.json');
const PREFS_FILE  = path.join(USER_DATA, 'user_prefs.json');
const TICKETS_DB  = path.join(USER_DATA, 'tickets_db.json');
const DRAFT_FILE  = path.join(USER_DATA, 'current_draft.json');

try { fs.mkdirSync(USER_DATA, { recursive: true }); } catch (_) {}

// ── Audit ─────────────────────────────────────────────────────────────────────
function loadAudit()   { try { return JSON.parse(fs.readFileSync(AUDIT_FILE,'utf8')); } catch { return []; } }
function saveAudit(l)  { try { fs.writeFileSync(AUDIT_FILE, JSON.stringify(l,null,2),'utf8'); } catch {} }
function audit(action, details={}, user='SYSTEM') {
  const log = loadAudit();
  const entry = {
    id: `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    action, user, details, version: APP_VERSION,
  };
  log.unshift(entry);
  if (log.length > 1000) log.splice(1000);
  saveAudit(log);
  return entry;
}

// ── Tickets DB ────────────────────────────────────────────────────────────────
function loadTickets() { try { return JSON.parse(fs.readFileSync(TICKETS_DB,'utf8')); } catch { return []; } }
function saveTicket(t) {
  const db = loadTickets();
  db.unshift(t);
  if (db.length > 500) db.splice(500);
  try { fs.writeFileSync(TICKETS_DB, JSON.stringify(db,null,2),'utf8'); } catch {}
}

// ── Prefs ─────────────────────────────────────────────────────────────────────
function loadPrefs()     { try { return JSON.parse(fs.readFileSync(PREFS_FILE,'utf8')); } catch { return {}; } }
function savePrefs(p)    { try { fs.writeFileSync(PREFS_FILE, JSON.stringify(p,null,2),'utf8'); } catch {} }

// ── Draft ─────────────────────────────────────────────────────────────────────
function loadDraft()     { try { return JSON.parse(fs.readFileSync(DRAFT_FILE,'utf8')); } catch { return null; } }
function saveDraft(d)    { try { fs.writeFileSync(DRAFT_FILE, JSON.stringify(d,null,2),'utf8'); } catch {} }
function clearDraft()    { try { fs.unlinkSync(DRAFT_FILE); } catch {} }

// ── Helpers ───────────────────────────────────────────────────────────────────
function ts()        { return new Date().toISOString().replace(/[:.]/g,'-').slice(0,19); }
function sanitize(s) {
  return (s||'CLIENTE').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_').toUpperCase();
}

// ── Ticket Formatter ──────────────────────────────────────────────────────────
function formatTxt(d) {
  const L = '─'.repeat(60), D = '═'.repeat(60);
  const now  = new Date();
  const data = now.toLocaleDateString('pt-BR');
  const hora = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const tktId = `TKT-${Date.now().toString(17).toUpperCase()}`;

  const val = (v) => v && v.trim() ? v.trim() : '—';

  return [
    D,
    '  TICKET GENERATOR',
    `  ${d.emitente_empresa || 'Clicbiz'}  |  Data: ${data}  |  Hora: ${hora}  |  ID: ${tktId}`,
    D, '',
    '  DADOS DO SOLICITANTE', L,
    `  Analista      : ${val(d.emitente_nome)}`,
    `  Telefone     : ${val(d.emitente_telefone)}`,
    `  E-mail      : ${val(d.emitente_email)}`, '',
    '  DADOS DO ESTABELECIMENTO', L,
    `  Licença      : ${val(d.licenca)}`,
    `  CNPJ         : ${val(d.cnpj)}`,
    `  Nome Cliente : ${val(d.nomeCliente)}`,
    `  Versão PDV   : ${val(d.versao)}`,
    `  Módulo Fiscal: ${val(d.modulo)}`, '',
    '  MOTIVO DO CONTATO', L, '',
    ...(d.motivo||'(sem descrição)').split('\n').map(l=>'  '+l),
    '', D,
    '  Atenciosamente,', '',
    `  ${val(d.emitente_nome)}`,
    `  ${d.emitente_empresa || 'Equipe de Suporte Técnico'}`,
    `  ✉  ${val(d.emitente_email)}`,
    D,
  ].join('\n');
}

// ── DeepSeek HTTP call (suporta http e https, self-hosted ou nuvem) ───────────
function deepseek(messages, maxTokens=1024) {
  return new Promise((resolve, reject) => {
    if (!DEEPSEEK_KEY && DEEPSEEK_BASE.includes('deepseek.com')) {
      reject(new Error('NO_KEY')); return;
    }

    const parsed = new URL(`${DEEPSEEK_BASE}/v1/chat/completions`);
    const body = JSON.stringify({ model: DEEPSEEK_MODEL, max_tokens: maxTokens, messages });
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${DEEPSEEK_KEY || 'ollama'}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = transport.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(raw);
          const t = j.choices?.[0]?.message?.content?.trim();
          if (t) resolve(t); else reject(new Error('EMPTY_RESPONSE'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
let win;
let splashWin;

function createSplash() {
  splashWin = new BrowserWindow({
    width: 320, height: 320,
    frame: false, transparent: true,
    resizable: false, alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { contextIsolation: true },
  });

  const splashHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:320px; height:320px; background:transparent; overflow:hidden; }
  .wrap {
    width:100%; height:100%;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    background:rgba(6,8,16,0.97);
    border:1px solid rgba(0,229,255,0.12);
    border-radius:4px;
    box-shadow:0 0 60px rgba(0,0,0,0.95), 0 0 30px rgba(0,180,255,0.06);
    animation:fadeIn .5s ease;
  }
  @keyframes fadeIn { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
  @keyframes triPulse {
    0%,100% { filter: drop-shadow(0 0 6px rgba(0,200,255,.5)) drop-shadow(0 0 18px rgba(0,180,255,.2)); opacity:.85; }
    50%      { filter: drop-shadow(0 0 14px rgba(0,230,255,.9)) drop-shadow(0 0 36px rgba(0,200,255,.4)); opacity:1; }
  }
  .eye-wrap { animation: triPulse 2.8s ease-in-out infinite; margin-bottom:24px; }
  .brand { font-family:'Courier New',monospace; font-size:13px; font-weight:700; color:rgba(0,229,255,.9); letter-spacing:4px; text-transform:uppercase; margin-bottom:5px; }
  .sub   { font-family:'Courier New',monospace; font-size:10px; color:rgba(0,180,255,.45); letter-spacing:2px; }
  .bar-wrap { margin-top:28px; width:140px; height:1px; background:rgba(0,180,255,.12); overflow:hidden; }
  .bar { height:100%; background:linear-gradient(90deg,#00b4d8,#00e5ff); animation:loadBar 2.4s ease-in-out forwards; }
  @keyframes loadBar { from{width:0} to{width:100%} }
  .dots span { display:inline-block; animation:blink 1s infinite; color:rgba(0,200,255,.5); }
  .dots span:nth-child(2){animation-delay:.2s} .dots span:nth-child(3){animation-delay:.4s}
  @keyframes blink{0%,100%{opacity:.15}50%{opacity:1}}
</style>
</head>
<body>
<div class="wrap">
  <div class="eye-wrap">
    <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tg" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#00e5ff" stop-opacity=".9"/>
          <stop offset="100%" stop-color="#0090b8" stop-opacity=".6"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- Outer triangle -->
      <polygon points="50,6 94,82 6,82" fill="none" stroke="url(#tg)" stroke-width="1.4" filter="url(#glow)"/>
      <!-- Mid triangle -->
      <polygon points="50,20 82,76 18,76" fill="none" stroke="rgba(0,200,255,.2)" stroke-width=".8"/>
      <!-- Horizontal bar inside -->
      <line x1="26" y1="62" x2="74" y2="62" stroke="rgba(0,200,255,.25)" stroke-width=".7"/>
      <!-- Eye outline -->
      <ellipse cx="50" cy="52" rx="12" ry="7.5" fill="none" stroke="url(#tg)" stroke-width="1.1" filter="url(#glow)"/>
      <!-- Iris -->
      <circle cx="50" cy="52" r="5" fill="none" stroke="url(#tg)" stroke-width=".9"/>
      <!-- Pupil -->
      <circle cx="50" cy="52" r="2.4" fill="url(#tg)" opacity=".95"/>
      <!-- Shine -->
      <circle cx="48.5" cy="50.8" r=".8" fill="rgba(255,255,255,.85)"/>
      <!-- Corner ticks -->
      <line x1="6" y1="82" x2="13" y2="82" stroke="rgba(0,200,255,.4)" stroke-width=".9"/>
      <line x1="94" y1="82" x2="87" y2="82" stroke="rgba(0,200,255,.4)" stroke-width=".9"/>
      <line x1="50" y1="6" x2="50" y2="12" stroke="rgba(0,200,255,.4)" stroke-width=".9"/>
    </svg>
  </div>
  <div class="brand">TICKET GENERATOR</div>
  <div class="sub">Mens in Corpore Tantum Molem Regit</div>
  <div class="sub"><span class="dots"><span>△</span><span>△</span><span>△</span><span>△</span><span>△</span><span>△</span><span>△</span><span>△</span></span></div>
  <div class="bar-wrap"><div class="bar"></div></div>
</div>
</body>
</html>`;

  const tmpSplash = path.join(USER_DATA, '_splash.html');
  fs.writeFileSync(tmpSplash, splashHTML, 'utf8');
  splashWin.loadFile(tmpSplash);
}

function createMain() {
  win = new BrowserWindow({
    // ── FIXED 500×700 — não redimensionável, apenas movível ──
    width:     500,
    height:    700,
    minWidth:  500,
    minHeight: 700,
    maxWidth:  500,
    maxHeight: 700,
    resizable: false,
    // ─────────────────────────────────────────────────────────
    frame:           false,
    transparent:     false,
    backgroundColor: '#06080f',
    title:           'Ticket Master',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    show: false,
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  audit('APP_LAUNCH', { version: APP_VERSION });
  createSplash();
  createMain();

  setTimeout(() => {
    win.once('ready-to-show', () => {
      if (splashWin && !splashWin.isDestroyed()) {
        setTimeout(() => { splashWin.close(); splashWin = null; }, 369);
      }
      win.show();
    });
    setTimeout(() => {
      if (win && !win.isVisible()) {
        win.show();
        if (splashWin && !splashWin.isDestroyed()) { splashWin.close(); splashWin = null; }
      }
    }, 3200);
  }, 2700);

  app.on('activate', () => { if (!win) createMain(); });
});

app.on('window-all-closed', () => {
  audit('APP_EXIT');
  if (process.platform !== 'darwin') app.quit();
});

// ══════════════════════════════════════════════════════════
// IPC HANDLERS
// ══════════════════════════════════════════════════════════

ipcMain.handle('sys-info', () => ({
  version: APP_VERSION, aiAvailable: !!DEEPSEEK_KEY,
  model: DEEPSEEK_MODEL, base: DEEPSEEK_BASE, userData: USER_DATA,
}));

// ── AI Status ─────────────────────────────────────────────
ipcMain.handle('ai-status', () => ({
  available: !!(DEEPSEEK_KEY || !DEEPSEEK_BASE.includes('deepseek.com')),
  model: DEEPSEEK_MODEL,
  base: DEEPSEEK_BASE,
  selfHosted: !DEEPSEEK_BASE.includes('deepseek.com'),
}));

// ── Prefs (emitente persisted) ────────────────────────────
ipcMain.handle('prefs-load', () => loadPrefs());
ipcMain.handle('prefs-save', (_e, prefs) => {
  const old = loadPrefs();
  const merged = { ...old, ...prefs };
  savePrefs(merged);
  audit('PREFS_UPDATED', { fields: Object.keys(prefs) }, prefs.emitente_nome || 'USER');
  return true;
});

// ── Draft ─────────────────────────────────────────────────
ipcMain.handle('draft-save',  (_e, data) => { saveDraft(data); return true; });
ipcMain.handle('draft-load',  ()         => loadDraft());
ipcMain.handle('draft-clear', ()         => { clearDraft(); return true; });

// ── Audit ─────────────────────────────────────────────────
ipcMain.handle('audit-get',   (_e, limit=100) => loadAudit().slice(0, limit));
ipcMain.handle('tickets-get', (_e, limit=50)  => loadTickets().slice(0, limit));

// ── AI Formalizar ─────────────────────────────────────────
ipcMain.handle('ai-formalizar', async (_e, { texto, user }) => {
  try {
    const result = await deepseek([
      { role: 'system', content:
        `Você é um assistente especializado em linguagem corporativa de suporte técnico de TI.\n` +
        `Reescreva o texto recebido de forma padronizada, clara, formal e profissional.\n` +
        `REGRAS:\n` +
        `1. Mantenha TODOS os fatos técnicos, versões, erros, testes e procedimentos.\n` +
        `2. Corrija erros ortográficos e gramaticais.\n` +
        `3. Use termos como "o cliente relata", "verificou-se", "foi executado", "constatou-se".\n` +
        `4. Estruture em 3 partes: (1) Relato do cliente, (2) Procedimentos realizados, (3) Resultado/situação atual.\n` +
        `5. NÃO invente informações. NÃO remova dados. APENAS reformate.\n` +
        `6. Retorne SOMENTE o texto formalizado. Sem markdown. Sem prefixos.`
      },
      { role: 'user', content: texto },
    ]);
    audit('AI_FORMALIZAR', { chars_in: texto.length, chars_out: result.length }, user);
    return { ok: true, texto: result };
  } catch (e) {
    audit('AI_FORMALIZAR_FAIL', { error: e.message }, user);
    return { ok: false, texto };
  }
});

// ── AI Sugerir ────────────────────────────────────────────
ipcMain.handle('ai-sugerir', async (_e, { dados, user }) => {
  try {
    const prompt =
      `Você é um assistente de suporte técnico Clicbiz.\n` +
      `Com base nos dados parciais abaixo, infira campos vazios.\n` +
      `Retorne SOMENTE JSON puro (sem markdown, sem comentários):\n` +
      `{"modulo":"","versao":"","motivo_hint":""}\n` +
      `- modulo: módulo fiscal provável (NFCe, SAT, MFe, NF-e, etc). Vazio se incerto.\n` +
      `- versao: sugira formato se incompleto. Vazio se incerto.\n` +
      `- motivo_hint: sugestão de 1 linha se motivo vazio. Vazio se não houver base.\n\n` +
      `Dados:\n${JSON.stringify(dados, null, 2)}`;
    const raw = await deepseek([{ role: 'user', content: prompt }], 256);
    return JSON.parse(raw.replace(/```json|```/g,'').trim());
  } catch { return {}; }
});

// ── Gerar Ticket ──────────────────────────────────────────
ipcMain.handle('gerar', async (_e, dados) => {
  const user = dados.emitente_nome || 'USER';
  audit('TICKET_GENERATE_START', { cliente: dados.nomeCliente, licenca: dados.licenca }, user);

  let motivoFinal = dados.motivo || '(sem descrição)';
  let aiUsed = false;

  // Tenta formalizar via AI (self-hosted ou nuvem)
  const aiAvail = !!(DEEPSEEK_KEY || !DEEPSEEK_BASE.includes('deepseek.com'));
  if (aiAvail && motivoFinal !== '(sem descrição)') {
    try {
      const r = await deepseek([
        { role: 'system', content:
          'Reescreva o texto de suporte técnico de forma formal e corporativa. ' +
          'Mantenha todos os fatos. Retorne SOMENTE o texto reformatado, sem markdown.'
        },
        { role: 'user', content: motivoFinal },
      ]);
      if (r && r.trim()) { motivoFinal = r.trim(); aiUsed = true; }
    } catch (_) { /* fallback offline */ }
  }

  const dadosFinais = { ...dados, motivo: motivoFinal };
  const texto    = formatTxt(dadosFinais);
  const nome     = sanitize(dados.nomeCliente || 'CLIENTE');
  const tktId    = `CBIZ-${Date.now().toString(17).toUpperCase()}`;
  const filename = `TICKET_${nome}_${ts()}.txt`;

  // Persist ticket record
  saveTicket({
    id: tktId,
    timestamp: new Date().toISOString(),
    cliente:  dados.nomeCliente  || null,
    licenca:  dados.licenca      || null,
    cnpj:     dados.cnpj         || null,
    versao:   dados.versao       || null,
    modulo:   dados.modulo       || null,
    contato:  dados.contato      || null,
    emitente: user,
    aiUsed,
    filename,
  });

  audit('TICKET_GENERATED', { tktId, cliente: dados.nomeCliente, aiUsed }, user);
  clearDraft();

  return { texto, filename, aiUsed, tktId, motivoFinal };
});

// ── Salvar ────────────────────────────────────────────────
ipcMain.handle('salvar', async (_e, { texto, filename, user }) => {
  const def = path.join(app.getPath('documents'), filename);
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Salvar Ticket',
    defaultPath: def,
    filters: [{ name: 'Texto', extensions: ['txt'] }],
    buttonLabel: 'Salvar',
  });
  if (canceled || !filePath) return { ok: false };
  try {
    fs.writeFileSync(filePath, texto, 'utf8');
    audit('TICKET_SAVED', { filePath }, user || 'USER');
    return { ok: true, filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── Copiar ────────────────────────────────────────────────
ipcMain.handle('copiar', (_e, { texto, user }) => {
  clipboard.writeText(texto);
  audit('TICKET_COPIED', {}, user || 'USER');
  return true;
});

// ── Open userData ─────────────────────────────────────────
ipcMain.handle('open-userdata', () => { shell.openPath(USER_DATA); return true; });

// ── Window controls (sem maximize — janela fixa) ──────────
ipcMain.on('win-min',   () => win?.minimize());
ipcMain.on('win-close', () => { audit('APP_CLOSE'); win?.close(); });
