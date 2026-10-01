const api = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

const PAGE_STYLE_ID = 'gfa-ai-injected-style';

function ensureStyle() {
  if (document.getElementById(PAGE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PAGE_STYLE_ID;
  style.textContent = `
    .gfa-ai-correct {
      background: rgba(52, 168, 83, 0.22) !important;
      border: 2px solid #34a853 !important;
      border-radius: 10px !important;
    }
    .gfa-ai-correct-label span, .gfa-ai-correct-label [dir="auto"] {
      color: #0b6b34 !important;
      font-weight: 700 !important;
    }
    body.gfa-ai-hidden .gfa-ai-correct,
    body.gfa-ai-hidden .gfa-ai-correct-label {
      background: transparent !important;
      border-color: transparent !important;
    }
    body.gfa-ai-hidden .gfa-ai-correct-label span,
    body.gfa-ai-hidden .gfa-ai-correct-label [dir="auto"] {
      color: inherit !important;
      font-weight: inherit !important;
    }
    body.gfa-ai-hidden #gfa-ai-fab,
    body.gfa-ai-hidden #gfa-ai-status { display: none !important; }
    #gfa-ai-fab {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #34a853;
      color: #fff;
      border: none;
      border-radius: 50%;
      padding: 0;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
    }
    #gfa-ai-fab:hover { background: #2d9249; }
    #gfa-ai-fab svg { width: 22px; height: 22px; }
    #gfa-ai-status {
      position: fixed;
      right: 16px;
      bottom: 70px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #202124;
      color: #e8eaed;
      border-radius: 10px;
      padding: 10px 14px;
      font: 600 13px/1.4 arial, sans-serif;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
      max-width: 320px;
    }
    #gfa-ai-status .gfa-ai-brand { display: flex; color: #34a853; flex: none; }
    #gfa-ai-status .gfa-ai-msg { min-width: 0; }
  `;
  document.head.appendChild(style);
}

function isQuestion(el) {
  return el.matches('[role="listitem"]');
}

function getQuestionTitle(q) {
  const heading = q.querySelector('[role="heading"]');
  return heading ? heading.textContent.replace(/\s*\*?$/, '').trim() : '';
}

function getOptions(q) {
  const out = [];
  const seen = new Set();
  const push = (el, text) => {
    const t = String(text).trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ el, text: t });
  };

  q.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"], option, [data-value], [data-answer-value]').forEach((el) => {
    let text = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('data-value') || el.getAttribute('data-answer-value'));
    if (!text) {
      const label = el.closest('label');
      if (label) {
        const span = label.querySelector('[dir="auto"]');
        text = span ? span.textContent : label.textContent;
      } else if (el.childElementCount === 0) {
        text = el.textContent;
      }
    }
    if (text) push(el, text.replace(/^\*+\s*/, ''));
  });

  return out;
}

function getQuestionType(q) {
  if (q.querySelector('[role="checkbox"]') || q.querySelector('[data-answer-value]')) return 'checkbox';
  if (q.querySelector('[role="radio"]') || q.querySelector('label [data-value]')) return 'radio';
  if (q.querySelector('select')) return 'select';
  if (q.querySelector('[role="option"]')) return 'listbox';
  if (q.querySelector('input[type="text"], textarea')) return 'text';
  if (q.querySelector('textarea, input:not([type="hidden"])')) return 'text';
  return 'unknown';
}

function collectQuestions() {
  const questions = [];
  document.querySelectorAll('[role="listitem"]').forEach((q) => {
    const title = getQuestionTitle(q);
    const options = getOptions(q);
    if (!title && options.length === 0) return;
    questions.push({ el: q, title, type: getQuestionType(q), options });
  });
  return questions;
}

function buildPrompt(questions) {
  const lines = ["Tu es un assistant qui aide à deviner les réponses d'un quiz Google Forms.",
    "Pour CHAQUE question, indique les indices (indexés à partir de 0) des options qui sont selon toi les meilleures réponses.",
    "RÉPONDS UNIQUEMENT avec du JSON valide au format : {\"answers\": [[indices de la q1], [indices de la q2], ...]}",
    "Réponds avec un tableau vide [] pour une question dont tu ne sais pas. Pour une question à choix unique, mets un seul indice.",
    "", "VOICI LES QUESTIONS :"];
  questions.forEach((q, qi) => {
    lines.push(`${qi} [${q.type}] ${q.title || '(sans titre)'}`);
    q.options.forEach((opt, oi) => lines.push(`  ${oi}. ${opt.text}`));
  });
  return lines.join('\n');
}

function highlight(questions, answers) {
  clearHighlights(questions);
  if (!Array.isArray(answers)) return;
  questions.forEach((q, qi) => {
    const chosen = answers[qi];
    if (!Array.isArray(chosen)) return;
    chosen.forEach((oi) => {
      const opt = q.options[oi];
      if (!opt) return;
      let target = opt.el;
      const label = opt.el.closest ? opt.el.closest('label, .nWQGrd, .eBFwI, li') : null;
      if (label) {
        label.classList.add('gfa-ai-correct', 'gfa-ai-correct-label');
      } else {
        target.classList.add('gfa-ai-correct');
      }
    });
  });
}

function clearHighlights(questions) {
  document.querySelectorAll('.gfa-ai-correct').forEach((el) => {
    el.classList.remove('gfa-ai-correct', 'gfa-ai-correct-label');
  });
  if (!Array.isArray(questions)) return;
  questions.forEach((q) => {
    q.options.forEach((opt) => {
      if (opt.el.classList) opt.el.classList.remove('gfa-ai-correct', 'gfa-ai-correct-label');
    });
  });
}

function extractAnswerJson(text) {
  const m = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    const answers = Array.isArray(parsed) ? parsed : parsed.answers;
    return answers;
  } catch (e) {
    return null;
  }
}

const BRAND = 'CleanShield';
const SHIELD_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
  '<path fill="currentColor" d="M12 1.5 3 5.2v6.1c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5.2L12 1.5Z"/>' +
  '<path fill="#2d9249" d="m10.7 15.6-3-3 1.4-1.4 1.6 1.6 4.2-4.2 1.4 1.4-5.6 5.6Z"/></svg>';

let statusTimer = null;
function setStatus(text, ms = 4000) {
  ensureStyle();
  let el = document.getElementById('gfa-ai-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gfa-ai-status';
    el.innerHTML = '<span class="gfa-ai-brand">' + SHIELD_SVG + '</span><span class="gfa-ai-msg"></span>';
    document.body.appendChild(el);
  }
  el.querySelector('.gfa-ai-msg').textContent = text;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.remove(), ms || 4000);
}

async function logActivity(msg) {
  try {
    const cfg = await api.storage.local.get({ stats: { pages: 0, runs: 0, answers: 0 }, log: [] });
    const stats = cfg.stats || { pages: 0, runs: 0, answers: 0 };
    const entries = Array.isArray(cfg.log) ? cfg.log.slice() : [];
    entries.unshift({ t: Date.now(), msg });
    await api.storage.local.set({ stats, log: entries.slice(0, 6) });
  } catch (e) { /* stockage indisponible */ }
}

function addFab() {
  if (document.getElementById('gfa-ai-fab')) return;
  const btn = document.createElement('button');
  btn.id = 'gfa-ai-fab';
  btn.title = BRAND + ' : nettoyer la page';
  btn.innerHTML = SHIELD_SVG;
  btn.addEventListener('click', runAnalysis);
  document.body.appendChild(btn);
}

const PROVIDER_LABELS = {
  'ollama-cloud': 'Ollama Cloud',
  claude: 'Claude',
  'ollama-local': 'Ollama local'
};

async function loadConfig() {
  const cfg = await api.storage.local.get({
    provider: '',
    baseUrl: '',
    customUrl: '',
    model: '',
    apiKey: '',
    protection: true,
    stats: { pages: 0, runs: 0, answers: 0 }
  });
  const customUrl = (cfg.customUrl || cfg.baseUrl || '').trim();
  let provider = cfg.provider;
  if (!provider) provider = customUrl.indexOf('ollama.com') !== -1 ? 'ollama-cloud' : 'ollama-local';
  return {
    provider,
    customUrl,
    model: (cfg.model || '').trim(),
    apiKey: (cfg.apiKey || '').trim(),
    protection: cfg.protection !== false,
    stats: cfg.stats || { pages: 0, runs: 0, answers: 0 }
  };
}

async function runAnalysis() {
  ensureStyle();
  addFab();
  const cfg = await loadConfig();
  if (!cfg.protection) {
    clearHighlights();
    setStatus('Protection désactivée.');
    return { error: 'Protection désactivée.' };
  }
  const questions = collectQuestions();
  if (questions.length === 0) {
    setStatus('Rien à nettoyer sur cette page.');
    logActivity('Aucune question détectée');
    return { error: 'Aucune question détectée sur cette page.' };
  }
  const label = PROVIDER_LABELS[cfg.provider] || cfg.provider;

  setStatus('Nettoyage en cours…', 20000);
  cfg.stats.pages += 1;
  await api.storage.local.set({ stats: cfg.stats });

  try {
    const resp = await api.runtime.sendMessage({
      type: 'gfa-chat',
      provider: cfg.provider,
      baseUrl: cfg.provider === 'ollama-local' ? cfg.customUrl : '',
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: [
        { role: 'user', content: buildPrompt(questions) }
      ]
    });
    if (!resp || resp.error) {
      const message = 'Erreur ' + label + ' : ' + ((resp && resp.error) || 'réponse vide');
      setStatus(message);
      logActivity('Erreur ' + label);
      return { error: message };
    }
    const answers = extractAnswerJson(resp.content);
    if (!answers) {
      setStatus('Réponse non reconnue : ' + String(resp.content).slice(0, 120));
      logActivity('Réponse non reconnue');
      return { error: 'Réponse IA non reconnue.' };
    }
    highlight(questions, answers);
    const nb = questions.reduce((acc, q, i) => acc + ((answers[i] || []).length), 0);
    cfg.stats.runs += 1;
    cfg.stats.answers += nb;
    await api.storage.local.set({ stats: cfg.stats });
    const summary = nb + ' réponse(s) surlignée(s).';
    setStatus(summary);
    logActivity(summary);
    return { ok: true, count: nb };
  } catch (err) {
    setStatus('Erreur : ' + err.message);
    return { error: err.message };
  }
}

function toggleHidden() {
  document.body.classList.toggle('gfa-ai-hidden');
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (!typing) {
      toggleHidden();
      addFab();
    }
  }
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'gfa-run') {
    runAnalysis().then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'gfa-clear') {
    clearHighlights();
    document.body.classList.remove('gfa-ai-hidden');
    sendResponse({ ok: true });
    return true;
  }
  return undefined;
});

setTimeout(() => {
  ensureStyle();
  addFab();
  loadConfig().then((cfg) => {
    if (cfg.protection) runAnalysis();
    else setStatus('Protection désactivée.', 3000);
  });
}, 600);