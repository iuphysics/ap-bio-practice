const $ = id => document.getElementById(id);
const history = new Map();
const pending = new Map();
let current = null, endpoint = '', accessCode = '', configuredEndpoint = '';
let sequence = 0;

function thread(id) {
  if (!history.has(id)) history.set(id, { messages: [], draft: '', allowAnswers: false, error: '' });
  return history.get(id);
}
export function validateEndpoint(value) {
  if (!value.trim()) return '';
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('Use the backend URL without passwords, query parameters, or fragments.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Use an HTTPS backend URL.');
  if (!url.pathname.endsWith('/api/chat')) url.pathname = url.pathname.replace(/\/$/, '') + '/api/chat';
  return url.href;
}
function render() {
  if (!current) return;
  const q = current.question, t = thread(q.id), waiting = pending.has(q.id);
  $('tutor-question').textContent = `Question ${q.id} · ${q.type === 'mcq' ? 'Multiple choice' : 'Free response'}`;
  const count = q.prompt.length + q.context.length + (q.options || []).filter(o => o.graphical).reduce((n,o) => n + o.images.length,0);
  $('tutor-context').textContent = `Includes this problem, its ${count} source ${count === 1 ? 'image' : 'images'}, and your ${q.type === 'mcq' ? 'selected answer' : 'current draft'}.`;
  $('tutor-messages').replaceChildren(...t.messages.map(message => {
    const row = document.createElement('div'); row.className = `tutor-message ${message.role}`;
    const who = document.createElement('b'); who.textContent = message.role === 'user' ? 'You' : 'Helix tutor';
    const text = document.createElement('div'); text.textContent = message.content;
    row.append(who, text); return row;
  }));
  $('tutor-empty').hidden = !!t.messages.length;
  $('tutor-input').value = t.draft;
  $('tutor-input').disabled = waiting;
  $('tutor-send').disabled = waiting || !t.draft.trim() || !endpoint || !accessCode;
  $('tutor-send').textContent = waiting ? 'Thinking…' : 'Send ↑';
  $('tutor-stop').hidden = !waiting;
  $('tutor-allow-answers').checked = t.allowAnswers;
  $('tutor-allow-answers').disabled = waiting;
  $('tutor-status').textContent = waiting ? `Reading question ${q.id} and its figures…` : t.error;
  $('tutor-setup-note').hidden = !!endpoint && !!accessCode;
  $('tutor-setup-note').textContent = !endpoint ? 'The AI tutor is not connected yet. The site owner needs to finish setup. You can still browse all practice questions.' : !accessCode ? 'Enter your class access code in Tutor settings to start chatting.' : '';
  $('tutor-log').scrollTop = $('tutor-log').scrollHeight;
}
export function syncTutor(question, state) {
  current = { question, selectedAnswer: state.answers[question.id] || null, draft: state.drafts[question.id] || '' };
  render();
}
async function send(event) {
  event.preventDefault();
  if (!current) return;
  const snapshot = { ...current }, id = snapshot.question.id, t = thread(id);
  const message = t.draft.trim();
  if (!message || pending.has(id) || !endpoint || !accessCode) return;
  const messages = [...t.messages.slice(-18), { role: 'user', content: message }];
  // Preserve alternating history and the failed question for an explicit retry.
  t.messages.push({ role: 'user', content: message }); t.draft = ''; t.error = '';
  const controller = new AbortController(), token = ++sequence;
  pending.set(id, { controller, token }); render();
  const timeout = setTimeout(() => controller.abort(), 75000);
  try {
    const response = await fetch(endpoint, { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Tutor-Code': accessCode },
      body: JSON.stringify({ questionId: id, messages, selectedAnswer: snapshot.selectedAnswer,
        draft: snapshot.draft.slice(0,12000), allowAnswers: t.allowAnswers }) });
    let data; try { data = await response.json(); } catch { throw new Error('The tutor server did not return a valid response. Check its URL in settings.'); }
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The tutor could not respond. Please try again.');
    if (data.questionId !== id || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('The tutor returned a response for the wrong question. Please retry.');
    if (pending.get(id)?.token !== token) return;
    t.messages.push({ role: 'assistant', content: data.reply });
    if (data.incomplete) t.error = 'This reply reached its length limit. Ask the tutor to continue.';
  } catch (error) {
    if (pending.get(id)?.token !== token) return;
    t.messages.pop(); t.draft = message;
    t.error = error.name === 'AbortError' ? 'Reply stopped. Your question is ready to send again.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (pending.get(id)?.token === token) pending.delete(id);
    if (current?.question.id === id) render();
  }
}
export async function initTutor() {
  $('tutor-toggle').addEventListener('click', () => {
    const opened = $('tutor-panel').hidden;
    $('tutor-panel').hidden = !opened; $('tutor-toggle').setAttribute('aria-expanded',String(opened));
    document.body.classList.toggle('tutor-open', opened);
    if (opened) { render(); $('tutor-input').focus(); }
  });
  $('tutor-close').addEventListener('click', () => { $('tutor-panel').hidden = true; document.body.classList.remove('tutor-open'); $('tutor-toggle').setAttribute('aria-expanded','false'); $('tutor-toggle').focus(); });
  $('tutor-input').addEventListener('input', event => { if (!current) return; thread(current.question.id).draft = event.target.value; $('tutor-send').disabled = !event.target.value.trim() || !endpoint || !accessCode; });
  $('tutor-form').addEventListener('submit', send);
  $('tutor-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('tutor-form').requestSubmit(); } });
  $('tutor-allow-answers').addEventListener('change', event => { thread(current.question.id).allowAnswers = event.target.checked; });
  $('tutor-stop').addEventListener('click', () => pending.get(current.question.id)?.controller.abort());
  $('tutor-clear').addEventListener('click', () => {
    const id = current.question.id;
    pending.get(id)?.controller.abort(); pending.delete(id); history.delete(id); render();
  });
  for (const button of document.querySelectorAll('[data-tutor-prompt]')) button.addEventListener('click', () => {
    if (!current || pending.has(current.question.id)) return;
    thread(current.question.id).draft = button.dataset.tutorPrompt; render(); $('tutor-input').focus();
  });
  $('tutor-settings-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const nextEndpoint = validateEndpoint($('tutor-endpoint').value || configuredEndpoint);
      const nextCode = $('tutor-code').value.trim();
      if (nextCode.startsWith('sk-')) throw new Error('Do not enter an OpenAI API key here. Use the separate class access code.');
      endpoint = nextEndpoint; accessCode = nextCode;
      $('tutor-settings-error').textContent = '';
      // Endpoint is public configuration. The access code stays in memory only.
      try { localStorage.setItem('helix-tutor-endpoint', endpoint); } catch { /* Optional preference. */ }
      $('tutor-settings').open = false; render();
    } catch (error) { $('tutor-settings-error').textContent = error.message; }
  });
  try {
    const config = await fetch('./tutor-config.json', { cache: 'no-cache' }).then(response => response.ok ? response.json() : {});
    configuredEndpoint = validateEndpoint(config.endpoint || '');
    let saved = ''; try { saved = localStorage.getItem('helix-tutor-endpoint') || ''; } catch { /* Optional preference. */ }
    const local = ['localhost','127.0.0.1'].includes(location.hostname);
    endpoint = validateEndpoint(saved || configuredEndpoint || (local ? location.origin + '/api/chat' : ''));
    $('tutor-endpoint').value = endpoint;
  } catch { endpoint = ''; }
  render();
}
