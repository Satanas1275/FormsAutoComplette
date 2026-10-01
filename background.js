browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (!msg || msg.type !== 'gfa-chat') return;
  const { baseUrl, apiKey, model, messages } = msg;
  const url = baseUrl.replace(/\/+$/, '') + '/api/chat';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 }
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { error: `HTTP ${res.status} : ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    return { content: data.message ? data.message.content : JSON.stringify(data) };
  } catch (err) {
    return { error: err.message };
  }
});