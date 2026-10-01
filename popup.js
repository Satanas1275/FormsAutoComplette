const defaults = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:8b',
  apiKey: ''
};

async function load() {
  const cfg = await browser.storage.local.get(defaults);
  document.getElementById('baseUrl').value = cfg.baseUrl;
  document.getElementById('model').value = cfg.model;
  document.getElementById('apiKey').value = cfg.apiKey;
}

document.getElementById('save').addEventListener('click', async () => {
  await browser.storage.local.set({
    baseUrl: document.getElementById('baseUrl').value.trim(),
    model: document.getElementById('model').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim()
  });
  const msg = document.getElementById('msg');
  msg.textContent = 'Enregistré ✓';
  setTimeout(() => (msg.textContent = ''), 1500);
});

load();