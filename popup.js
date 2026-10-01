const api = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

const PROVIDERS = {
  'ollama-cloud': {
    endpoint: 'https://ollama.com',
    custom: false,
    model: 'gpt-oss:120b-cloud',
    models: ['gpt-oss:120b-cloud', 'gpt-oss:20b-cloud', 'deepseek-v3.1:671b-cloud', 'qwen3-coder:480b-cloud'],
    keyLabel: 'Clé API Ollama Cloud',
    keyPlaceholder: 'ollama_xxxxxxxx'
  },
  claude: {
    endpoint: 'https://api.anthropic.com',
    custom: false,
    model: 'claude-sonnet-5',
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5', 'claude-fable-5'],
    keyLabel: 'Clé API Anthropic',
    keyPlaceholder: 'sk-ant-xxxxxxxx'
  },
  'ollama-local': {
    endpoint: 'http://localhost:11434',
    custom: true,
    model: 'qwen3:8b',
    models: ['qwen3:8b', 'qwen3.5:9b', 'llama3.2:latest', 'gemma4:e2b', 'gpt-oss:20b'],
    keyLabel: 'Clé API (vide en local)',
    keyPlaceholder: 'optionnel'
  }
};

const DEFAULTS = {
  provider: 'ollama-cloud',
  customUrl: 'http://localhost:11434',
  baseUrl: '',
  model: '',
  apiKey: '',
  protection: true,
  stats: { pages: 0, runs: 0, answers: 0 },
  log: []
};

const el = {
  version: document.getElementById('version'),
  protection: document.getElementById('protection'),
  main: document.getElementById('main'),
  advanced: document.getElementById('advanced'),
  dot: document.getElementById('dot'),
  state: document.getElementById('state'),
  count: document.getElementById('count'),
  statPages: document.getElementById('statPages'),
  statRuns: document.getElementById('statRuns'),
  statAnswers: document.getElementById('statAnswers'),
  log: document.getElementById('log'),
  emptyLog: document.getElementById('emptyLog'),
  scan: document.getElementById('scan'),
  close: document.getElementById('close'),
  provider: document.getElementById('provider'),
  endpoint: document.getElementById('endpoint'),
  urlBlock: document.getElementById('urlBlock'),
  baseUrl: document.getElementById('baseUrl'),
  model: document.getElementById('model'),
  models: document.getElementById('models'),
  fetchModels: document.getElementById('fetchModels'),
  keyLabel: document.getElementById('keyLabel'),
  apiKey: document.getElementById('apiKey'),
  save: document.getElementById('save'),
  msg: document.getElementById('msg')
};

let cfg = { ...DEFAULTS };
let fetchedModels = [];

function currentPreset() {
  return PROVIDERS[el.provider.value] || PROVIDERS['ollama-local'];
}

function resolvedUrl() {
  const preset = currentPreset();
  if (preset.custom) return (el.baseUrl.value.trim() || preset.endpoint).replace(/\/+$/, '');
  return preset.endpoint;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function setMessage(text, color) {
  el.msg.textContent = text;
  el.msg.style.color = color || '#34a853';
}

function sendToTab(msg) {
  try {
    return Promise.resolve(api.tabs.sendMessage(msg)).catch(() => ({
      error: 'Ouvrez un Google Form dans cet onglet.'
    }));
  } catch (e) {
    return Promise.resolve({ error: 'Onglet non compatible.' });
  }
}

function isTyping(e) {
  const target = e.target || {};
  const tag = (target.tagName || '').toLowerCase();
  if (tag === 'textarea' || target.isContentEditable) return true;
  if (tag !== 'input') return false;
  const type = (target.type || 'text').toLowerCase();
  return ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].indexOf(type) === -1;
}

function renderStats() {
  const stats = cfg.stats || DEFAULTS.stats;
  el.protection.checked = cfg.protection !== false;
  el.dot.classList.toggle('on', cfg.protection !== false);
  el.state.textContent = cfg.protection !== false ? 'Protection activée' : 'Protection désactivée';
  el.count.textContent = (stats.answers || 0) + ' réponses trouvées';
  el.statPages.textContent = stats.pages || 0;
  el.statRuns.textContent = stats.runs || 0;
  el.statAnswers.textContent = stats.answers || 0;

  const entries = Array.isArray(cfg.log) ? cfg.log : [];
  el.log.innerHTML = '';
  entries.forEach((entry) => {
    const li = document.createElement('li');
    const time = document.createElement('span');
    time.textContent = formatTime(entry.t);
    const msg = document.createElement('em');
    msg.textContent = entry.msg;
    msg.title = entry.msg;
    li.appendChild(time);
    li.appendChild(msg);
    el.log.appendChild(li);
  });
  el.emptyLog.hidden = entries.length > 0;
}

function renderProvider(keepModel) {
  const preset = currentPreset();
  el.urlBlock.hidden = !preset.custom;
  el.endpoint.textContent = 'Endpoint : ' + preset.endpoint;
  el.endpoint.hidden = preset.custom;
  el.keyLabel.textContent = preset.keyLabel;
  el.apiKey.placeholder = preset.keyPlaceholder;
  el.fetchModels.hidden = !preset.custom;
  const suggestions = fetchedModels.length && preset.custom ? fetchedModels : preset.models;
  el.models.innerHTML = '';
  suggestions.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    el.models.appendChild(option);
  });
  if (!keepModel || !el.model.value.trim()) el.model.value = preset.model;
}

function toggleAdvanced(force) {
  const show = typeof force === 'boolean' ? force : el.advanced.hidden;
  el.advanced.hidden = !show;
  el.main.hidden = show;
  if (show) el.close.focus();
}

async function ensureHostPermission(url) {
  try {
    const origin = new URL(url).origin + '/*';
    const has = await api.permissions.contains({ origins: [origin] });
    if (has) return true;
    return await api.permissions.request({ origins: [origin] });
  } catch (e) {
    return true;
  }
}

el.protection.addEventListener('change', async () => {
  cfg.protection = el.protection.checked;
  await api.storage.local.set({ protection: cfg.protection });
  renderStats();
  sendToTab({ type: cfg.protection ? 'gfa-run' : 'gfa-clear' });
});

el.scan.addEventListener('click', async () => {
  el.scan.disabled = true;
  el.scan.textContent = 'Nettoyage…';
  try {
    const resp = await sendToTab({ type: 'gfa-run' });
    if (!resp || resp.error) setMessage(resp && resp.error ? resp.error : 'Aucune page compatible dans cet onglet.', '#d93025');
    else setMessage('Page nettoyée ✓');
    await reload();
  } finally {
    el.scan.disabled = false;
    el.scan.textContent = 'Nettoyer cette page';
  }
});

el.close.addEventListener('click', () => toggleAdvanced(false));

el.provider.addEventListener('change', () => renderProvider(false));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    toggleAdvanced(false);
    return;
  }
  if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'h' || e.key === 'H') toggleAdvanced();
});

el.fetchModels.addEventListener('click', async () => {
  setMessage('Chargement…', '#5f6368');
  el.fetchModels.disabled = true;
  try {
    if (!(await ensureHostPermission(resolvedUrl()))) {
      setMessage('Permission réseau refusée.', '#d93025');
      return;
    }
    const resp = await api.runtime.sendMessage({
      type: 'gfa-models',
      baseUrl: resolvedUrl(),
      apiKey: el.apiKey.value.trim()
    });
    if (!resp || resp.error) {
      setMessage('Erreur : ' + ((resp && resp.error) || 'réponse vide'), '#d93025');
      return;
    }
    fetchedModels = resp.models || [];
    if (!fetchedModels.length) {
      setMessage('Aucun modèle installé sur ce serveur.', '#5f6368');
      return;
    }
    renderProvider(true);
    setMessage(fetchedModels.length + ' modèle(s) trouvé(s).');
  } catch (err) {
    setMessage('Erreur : ' + err.message, '#d93025');
  } finally {
    el.fetchModels.disabled = false;
  }
});

el.save.addEventListener('click', async () => {
  const preset = currentPreset();
  const model = el.model.value.trim() || preset.model;
  const customUrl = (el.baseUrl.value.trim() || preset.endpoint).replace(/\/+$/, '');
  if (preset.custom) {
    try {
      new URL(customUrl);
    } catch (e) {
      setMessage('URL invalide.', '#d93025');
      return;
    }
    if (!(await ensureHostPermission(customUrl))) {
      setMessage('Permission réseau refusée pour ' + customUrl, '#d93025');
      return;
    }
  }
  await api.storage.local.set({
    provider: el.provider.value,
    customUrl,
    model,
    apiKey: el.apiKey.value.trim()
  });
  cfg.provider = el.provider.value;
  cfg.customUrl = customUrl;
  cfg.model = model;
  cfg.apiKey = el.apiKey.value.trim();
  el.model.value = model;
  setMessage('Enregistré ✓');
  setTimeout(() => setMessage(''), 1500);
});

async function reload() {
  cfg = await api.storage.local.get(DEFAULTS);
  renderStats();
  renderProvider(true);
}

async function init() {
  try {
    const manifest = api.runtime.getManifest();
    el.version.textContent = 'v' + manifest.version;
  } catch (e) { /* manifest indisponible */ }

  cfg = await api.storage.local.get(DEFAULTS);
  const legacyUrl = (cfg.customUrl && cfg.customUrl.indexOf('http') === 0 ? cfg.customUrl : cfg.baseUrl || '').trim();
  let provider = cfg.provider;
  if (!provider) provider = legacyUrl.indexOf('ollama.com') !== -1 ? 'ollama-cloud' : 'ollama-local';
  el.provider.value = provider;
  const preset = PROVIDERS[provider] || PROVIDERS['ollama-local'];
  el.baseUrl.value = legacyUrl.indexOf('http') === 0 ? legacyUrl : preset.endpoint;
  el.model.value = cfg.model || preset.model;
  el.apiKey.value = cfg.apiKey || '';
  renderStats();
  renderProvider(true);
}

init();