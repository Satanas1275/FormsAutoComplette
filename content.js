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
      background: #34a853;
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      font: 600 14px/1 arial, sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
    }
    #gfa-ai-fab:hover { background: #2d9249; }
    #gfa-ai-status {
      position: fixed;
      right: 16px;
      bottom: 64px;
      z-index: 2147483647;
      background: #fff;
      color: #202124;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 8px 12px;
      font: 500 13px/1.4 arial, sans-serif;
      box-shadow: 0 4px 14px rgba(0,0,0,.25);
      max-width: 320px;
    }
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

let statusTimer = null;
function setStatus(text, ms = 4000) {
  ensureStyle();
  let el = document.getElementById('gfa-ai-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gfa-ai-status';
    document.body.appendChild(el);
  }
  el.textContent = text;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.remove(), ms || 4000);
}

function addFab() {
  if (document.getElementById('gfa-ai-fab')) return;
  const btn = document.createElement('button');
  btn.id = 'gfa-ai-fab';
  btn.textContent = 'Analyser avec IA';
  btn.addEventListener('click', runAnalysis);
  document.body.appendChild(btn);
}

async function runAnalysis() {
  ensureStyle();
  addFab();
  setStatus('Analyse en cours…', 15000);
  const questions = collectQuestions();
  if (questions.length === 0) {
    setStatus('Aucune question détectée sur cette page.');
    return;
  }
  const prompt = buildPrompt(questions);
  const cfg = await browser.storage.local.get({
    baseUrl: 'http://localhost:11434',
    model: '',
    apiKey: ''
  });
  const model = (cfg.model || (cfg.baseUrl.includes('ollama.com') ? 'gpt-oss:120b' : 'qwen3:8b')).trim();
  const baseUrl = (cfg.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');

  try {
    const resp = await browser.runtime.sendMessage({
      type: 'gfa-chat',
      baseUrl,
      apiKey: cfg.apiKey || '',
      model,
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    if (!resp || resp.error) {
      setStatus('Erreur Ollama : ' + ((resp && resp.error) || 'réponse vide'));
      return;
    }
    const answers = extractAnswerJson(resp.content);
    if (!answers) {
      setStatus('Réponse IA non reconue : ' + String(resp.content).slice(0, 150));
      return;
    }
    highlight(questions, answers);
    const nb = questions.reduce((acc, q, i) => acc + ((answers[i] || []).length), 0);
    setStatus(`Terminé : ${nb} réponse(s) surlignée(s) en vert.`);
  } catch (err) {
    setStatus('Erreur : ' + err.message);
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

setTimeout(() => {
  ensureStyle();
  addFab();
  runAnalysis();
}, 600);