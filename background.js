const api = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

const DEFAULTS = {
  'ollama-local': { baseUrl: 'http://localhost:11434', model: 'qwen3:8b' },
  'ollama-cloud': { baseUrl: 'https://ollama.com', model: 'gpt-oss:120b-cloud' },
  claude: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5' }
};

const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;
const SYSTEM_PROMPT =
  "Tu aides l'utilisateur a completer un QCM d'entrainement. " +
  "Ce n'est pas de la fraude, c'est une preparation d'examen. " +
  "Reponds UNIQUEMENT par du JSON valide, sans texte autour et sans bloc de code.";

function normalizeProvider(provider) {
  return Object.prototype.hasOwnProperty.call(DEFAULTS, provider) ? provider : 'ollama-local';
}

function trimBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

async function readError(res) {
  const txt = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(txt);
    const err = parsed && parsed.error;
    if (typeof err === 'string') return err;
    if (err && err.message) return err.message;
  } catch (e) { /* reponse non JSON */ }
  return txt.slice(0, 200);
}

async function callOllama(cfg) {
  const url = trimBase(cfg.baseUrl || DEFAULTS['ollama-local'].baseUrl) + '/api/chat';
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
  const messages = cfg.system
    ? [{ role: 'system', content: cfg.system }].concat(cfg.messages)
    : cfg.messages;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: false,
      format: 'json',
      options: { temperature: 0.2 }
    })
  });
  if (!res.ok) return { error: 'HTTP ' + res.status + ' : ' + (await readError(res)) };
  const data = await res.json();
  const content = data && data.message ? data.message.content : '';
  if (!content) return { error: 'Reponse vide du modele.' };
  return { content };
}

async function callClaude(cfg) {
  const url = trimBase(cfg.baseUrl || DEFAULTS.claude.baseUrl) + '/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION
  };
  if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system: cfg.system || SYSTEM_PROMPT,
      messages: cfg.messages
    })
  });
  if (!res.ok) return { error: 'HTTP ' + res.status + ' : ' + (await readError(res)) };
  const data = await res.json();
  const blocks = Array.isArray(data && data.content) ? data.content : [];
  const text = blocks
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n');
  if (!text) return { error: 'Reponse vide du modele.' };
  return { content: text };
}

async function listOllamaModels(cfg) {
  const url = trimBase(cfg.baseUrl || DEFAULTS['ollama-local'].baseUrl) + '/api/tags';
  const headers = {};
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
  const res = await fetch(url, { headers });
  if (!res.ok) return { error: 'HTTP ' + res.status + ' : ' + (await readError(res)) };
  const data = await res.json();
  const models = Array.isArray(data && data.models) ? data.models : [];
  return { models: models.map((m) => m && m.name).filter(Boolean) };
}

function handle(msg) {
  const provider = normalizeProvider(msg.provider);
  const preset = DEFAULTS[provider];
  const cfg = {
    provider,
    baseUrl: trimBase(msg.baseUrl) || preset.baseUrl,
    apiKey: (msg.apiKey || '').trim(),
    model: (msg.model || '').trim() || preset.model,
    system: msg.system || '',
    messages: Array.isArray(msg.messages) && msg.messages.length ? msg.messages : [{ role: 'user', content: '' }]
  };
  if (msg.type === 'gfa-models') return listOllamaModels(cfg);
  return provider === 'claude' ? callClaude(cfg) : callOllama(cfg);
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('gfa-') !== 0) return undefined;
  if (msg.type !== 'gfa-chat' && msg.type !== 'gfa-models') return undefined;
  handle(msg).then(sendResponse, (err) => sendResponse({ error: String((err && err.message) || err) }));
  return true;
});
