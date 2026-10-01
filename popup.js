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

const el = {
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

let fetchedModels = [];

function currentPreset() {
  return PROVIDERS[el.provider.value] || PROVIDERS['ollama-local'];
}

function resolvedUrl() {
  const preset = currentPreset();
  if (preset.custom) return (el.baseUrl.value.trim() || preset.endpoint).replace(/\/+$/, '');
  return preset.endpoint;
}

function setMessage(text, color) {
  el.msg.textContent = text;
  el.msg.style.color = color || '#34a853';
}

function fillDatalist(models) {
  el.models.innerHTML = '';
  models.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    el.models.appendChild(option);
  });
}

function renderProvider(keepModel) {
  const preset = currentPreset();
  el.urlBlock.hidden = !preset.custom;
  el.endpoint.textContent = 'Endpoint : ' + preset.endpoint;
  el.endpoint.hidden = preset.custom;
  el.keyLabel.textContent = preset.keyLabel;
  el.apiKey.placeholder = preset.keyPlaceholder;
  el.fetchModels.hidden = !preset.custom;
  fillDatalist(fetchedModels.length && preset.custom ? fetchedModels : preset.models);
  if (!keepModel) el.model.value = preset.model;
  else if (!el.model.value.trim()) el.model.value = preset.model;
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

el.provider.addEventListener('change', () => {
  renderProvider(false);
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
  el.model.value = model;
  setMessage('Enregistré ✓');
  setTimeout(() => setMessage(''), 1500);
});

async function load() {
  const cfg = await api.storage.local.get({ provider: '', baseUrl: '', customUrl: '', model: '', apiKey: '' });
  const legacyUrl = (cfg.customUrl || cfg.baseUrl || '').trim();
  let provider = cfg.provider;
  if (!provider) provider = legacyUrl.indexOf('ollama.com') !== -1 ? 'ollama-cloud' : 'ollama-local';
  el.provider.value = provider;
  const preset = PROVIDERS[provider] || PROVIDERS['ollama-local'];
  el.baseUrl.value = legacyUrl.indexOf('http') === 0 ? legacyUrl : preset.endpoint;
  el.model.value = cfg.model || preset.model;
  el.apiKey.value = cfg.apiKey || '';
  renderProvider(true);
}

load();
