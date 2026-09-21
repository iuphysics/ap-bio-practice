import { shuffle, restoreState } from './core.js?v=review-1';
import { initTutor, syncTutor } from './tutor.js?v=1';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'helix-ap-biology-v1';
let questions, byId, state, toastTimer;
let reviewOnly = false;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { $('save-status').textContent = 'Progress is temporary in this browser'; }
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}
function session() { return state.sessions[state.mode]; }
function current() { return byId.get(session().order[session().index]); }
function visibleOrder() { return session().order.filter(id => !reviewOnly || state.flagged[id]); }
function step(direction) {
  const ids = visibleOrder(), index = ids.indexOf(current().id);
  const id = ids[Math.max(0, Math.min(ids.length - 1, index + direction))];
  navigate(session().order.indexOf(id));
}
function imageList(container, assets, label) {
  container.replaceChildren(...assets.map((asset, i) => {
    const img = document.createElement('img');
    img.src = asset.src;
    img.width = asset.width;
    img.height = asset.height;
    img.alt = `${label}, part ${i + 1}. ${asset.text || 'Refer to the original diagram.'}`;
    img.decoding = 'async';
    img.addEventListener('error', () => { img.alt = 'This question image could not load. Check your connection and reload.'; });
    return img;
  }));
}
function updateStats() {
  const pool = questions.filter(q => q.type === state.mode);
  const completed = pool.filter(q => state.mode === 'mcq' ? state.answers[q.id] : state.reviewed[q.id]).length;
  $('answered-count').replaceChildren(document.createTextNode(`${completed} `));
  const total = document.createElement('span'); total.textContent = `/ ${pool.length}`;
  $('answered-count').append(total);
  $('completion-label').textContent = state.mode === 'mcq' ? 'answered' : 'reviewed';
  $('progress').max = pool.length; $('progress').value = completed;
  if (state.mode === 'mcq') {
    const correct = pool.filter(q => state.answers[q.id] === q.correct).length;
    $('score-line').textContent = completed ? `${correct} correct · ${Math.round(correct / completed * 100)}% accuracy` : 'Choose an answer to begin.';
  } else {
    const drafted = pool.filter(q => state.drafts[q.id]?.trim()).length;
    $('score-line').textContent = `${drafted} drafted · ${completed} self-reviewed`;
  }
  const marked = pool.filter(q => state.flagged[q.id]).length;
  $('review-filter').textContent = reviewOnly ? `Show all questions · ${marked} marked` : `Review marked (${marked})`;
  $('review-filter').disabled = !marked;
  $('review-filter').setAttribute('aria-pressed', String(reviewOnly));
  $('jump').replaceChildren(...visibleOrder().map(id => {
    const q = byId.get(id), opt = document.createElement('option');
    const status = q.type === 'mcq' ? (state.answers[id] ? (state.answers[id] === q.correct ? ' · Correct' : ' · Missed') : '') : (state.reviewed[id] ? ' · Reviewed' : state.drafts[id]?.trim() ? ' · Draft' : '');
    opt.value = String(session().order.indexOf(id)); opt.textContent = `Question ${id}${state.flagged[id] ? ' · ★ Marked' : ''}${status}`; return opt;
  }));
  $('jump').value = String(session().index);
}
function renderMCQ(q) {
  const selected = state.answers[q.id];
  $('answer-instruction').textContent = selected ? 'Your first answer is saved for this round.' : 'Choose one answer. You’ll see feedback after you select it.';
  $('options').replaceChildren(...q.options.map(option => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'option';
    button.dataset.letter = option.letter;
    button.disabled = !!selected;
    button.setAttribute('aria-label', `Answer ${option.letter}: ${option.text || 'diagram shown'}`);
    const letter = document.createElement('span'); letter.className = 'option-letter'; letter.textContent = option.letter;
    const body = document.createElement('span'); body.className = 'option-content';
    // Render simple prose responsively. Keep exact source crops for graphical,
    // chemical, mathematical, and tabular answer options.
    if (option.text && !option.graphical) body.textContent = option.text.replace(/\s+/g, ' ');
    else {
      const images = document.createElement('span'); images.className = 'document-images';
      imageList(images, option.images, `Option ${option.letter}`); body.append(images);
    }
    button.append(letter, body);
    if (selected && (option.letter === q.correct || option.letter === selected)) {
      const right = option.letter === q.correct;
      button.classList.add(right ? 'correct' : 'wrong');
      const result = document.createElement('span'); result.className = 'option-result';
      result.textContent = right ? '✓ Correct' : 'Your answer'; button.append(result);
    }
    button.addEventListener('click', () => {
      if (state.answers[q.id]) return;
      state.answers[q.id] = option.letter; save(); renderMCQ(q); updateStats(); syncTutor(q, state);
    });
    return button;
  }));
  $('feedback').hidden = !selected;
  $('feedback').replaceChildren();
  $('explanation').hidden = !selected || !q.explanation.length;
  $('explanation-images').replaceChildren();
  if (selected) {
    const right = selected === q.correct;
    $('feedback').classList.toggle('incorrect', !right);
    const heading = document.createElement('strong'); heading.textContent = right ? 'That’s right.' : 'Not quite — keep going.';
    $('feedback').append(heading, document.createTextNode(right ? `${q.correct} is the correct answer.` : `You chose ${selected}. The correct answer is ${q.correct}.`));
    if (q.explanation.length) imageList($('explanation-images'), q.explanation, 'Answer explanation');
    else $('feedback').append(document.createTextNode(' The source marks this answer as correct but does not provide a written explanation.'));
  }
}
function updateDraftControls(q) {
  const text = state.drafts[q.id] || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $('word-count').textContent = `${words} ${words === 1 ? 'word' : 'words'} · saved automatically`;
  $('reveal-rubric').disabled = !text.trim();
  $('reveal-rubric').hidden = !!state.revealed[q.id];
}
function renderFRQ(q) {
  $('response').value = state.drafts[q.id] || '';
  updateDraftControls(q);
  $('rubric-panel').hidden = !state.revealed[q.id];
  $('rubric-images').replaceChildren();
  if (state.revealed[q.id]) imageList($('rubric-images'), q.rubric, 'Original scoring guide');
  $('mark-reviewed').disabled = !!state.reviewed[q.id];
  $('mark-reviewed').textContent = state.reviewed[q.id] ? 'Reviewed ✓' : 'Mark as reviewed ✓';
}
function render() {
  if (reviewOnly && !visibleOrder().length) { reviewOnly = false; toast('No marked questions in this mode. Showing all questions.'); }
  if (reviewOnly && !state.flagged[current().id]) {
    session().index = session().order.indexOf(visibleOrder()[0]);
    save();
  }
  const q = current(), s = session();
  const visible = visibleOrder(), position = visible.indexOf(q.id);
  $('mark-review').textContent = state.flagged[q.id] ? '★ Marked for review' : '☆ Mark for review';
  $('mark-review').setAttribute('aria-pressed', String(!!state.flagged[q.id]));
  for (const mode of ['mcq', 'frq']) $('mode-' + mode).setAttribute('aria-pressed', String(state.mode === mode));
  $('position').textContent = `${position + 1} of ${visible.length} ${reviewOnly ? 'marked for review' : 'in this round'}`;
  $('question-type').textContent = q.type === 'mcq' ? 'MULTIPLE CHOICE' : 'FREE RESPONSE';
  $('source-page').textContent = `AP BIOLOGY · SOURCE PAGE ${q.page}`;
  $('question-title').textContent = `Question ${q.id}`;
  $('source-note').hidden = !q.note; $('source-note').textContent = q.note || '';
  $('context').hidden = !q.context.length;
  // Collapsing a previous question's material must never hide the figures
  // belonging to a different question reached by Next, Jump, or Shuffle.
  $('context').open = true;
  $('context-label').textContent = q.contextLabel || 'Shared passage & figures';
  $('context-source').textContent = q.context.length ? `Source page ${q.contextSourcePage || q.context[0].page} · Included with this question in any order` : '';
  imageList($('context-images'), q.context, 'Shared passage and figures');
  imageList($('prompt'), q.prompt, `Question ${q.id}`);
  $('transcript').open = false;
  $('transcript-text').textContent = [...q.context, ...q.prompt].map(asset => asset.text).join('\n\n');
  $('mcq-panel').hidden = q.type !== 'mcq'; $('frq-panel').hidden = q.type !== 'frq';
  // Remove hidden answers from the previous question's DOM.
  $('options').replaceChildren(); $('feedback').replaceChildren(); $('feedback').hidden = true;
  $('explanation-images').replaceChildren(); $('explanation').hidden = true; $('explanation').open = false;
  $('rubric-images').replaceChildren(); $('rubric-panel').hidden = true;
  if (q.type === 'mcq') renderMCQ(q); else renderFRQ(q);
  $('previous').disabled = position === 0; $('next').disabled = position === visible.length - 1;
  $('next').textContent = position === visible.length - 1 ? 'Last question ✓' : 'Next question →';
  $('order-label').textContent = s.shuffled ? 'Shuffled question order' : 'Original question order';
  $('question-card').setAttribute('aria-busy', 'false');
  updateStats();
  syncTutor(q, state);
}
function navigate(index) {
  session().index = Math.max(0, Math.min(session().order.length - 1, index)); save(); render();
  $('question-title').focus({ preventScroll: true });
  $('question-card').scrollIntoView({ behavior: 'instant', block: 'start' });
}
async function init() {
  try {
    const response = await fetch('./questions.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Question bank returned ${response.status}`);
    const data = await response.json(); questions = data.questions;
    byId = new Map(questions.map(q => [q.id, q]));
    let saved; try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* A fresh session is safe. */ }
    state = restoreState(saved, questions);
    for (const mode of ['mcq', 'frq']) $('mode-' + mode).addEventListener('click', () => { state.mode = mode; save(); render(); });
    $('shuffle').addEventListener('click', () => {
      session().order = shuffle(session().order); session().index = 0; session().shuffled = true;
      save(); render(); toast('Questions shuffled. Your answers are kept.');
    });
    $('jump').addEventListener('change', event => navigate(Number(event.target.value)));
    $('previous').addEventListener('click', () => step(-1));
    $('next').addEventListener('click', () => step(1));
    $('mark-review').addEventListener('click', () => {
      const id = current().id;
      if (state.flagged[id]) delete state.flagged[id]; else state.flagged[id] = true;
      render(); save();
    });
    $('review-filter').addEventListener('click', () => { reviewOnly = !reviewOnly; render(); save(); });
    $('restart').addEventListener('click', () => {
      if (!confirm(`Start a fresh ${state.mode === 'mcq' ? 'multiple-choice' : 'free-response'} round? This clears this mode’s answers${state.mode === 'frq' ? ' and drafts' : ''}.`)) return;
      for (const id of session().order) for (const field of (state.mode === 'mcq' ? ['answers'] : ['drafts', 'revealed', 'reviewed'])) delete state[field][id];
      session().index = 0; save(); render(); toast('Fresh round started.');
    });
    $('response').addEventListener('input', event => {
      const q = current(); state.drafts[q.id] = event.target.value;
      // Editing a self-reviewed response makes it a draft again.
      delete state.reviewed[q.id];
      if (!event.target.value.trim()) { delete state.revealed[q.id]; $('rubric-panel').hidden = true; $('rubric-images').replaceChildren(); }
      $('mark-reviewed').disabled = false; $('mark-reviewed').textContent = 'Mark as reviewed ✓';
      save(); updateDraftControls(q); updateStats(); syncTutor(q, state);
    });
    $('reveal-rubric').addEventListener('click', () => {
      const q = current(); if (!state.drafts[q.id]?.trim()) return;
      state.revealed[q.id] = true; save(); renderFRQ(q);
    });
    $('mark-reviewed').addEventListener('click', () => {
      const q = current(); if (!state.revealed[q.id] || !state.drafts[q.id]?.trim()) return;
      state.reviewed[q.id] = true; save(); renderFRQ(q); updateStats(); toast('Response marked as reviewed.');
    });
    $('enlarge').addEventListener('click', () => {
      const q = current();
      const assets = [...q.context, ...q.prompt, ...(q.type === 'mcq' ? q.options.flatMap(o => o.images) : [])];
      imageList($('dialog-images'), assets, `Question ${q.id}`); $('image-dialog').showModal();
    });
    $('close-dialog').addEventListener('click', () => $('image-dialog').close());
    $('image-dialog').addEventListener('click', event => { if (event.target === $('image-dialog')) $('image-dialog').close(); });
    render();
    initTutor();
  } catch (error) {
    $('position').textContent = 'Unable to load the question bank';
    $('question-title').textContent = 'Let’s get you connected.';
    $('prompt').textContent = 'Serve this folder with a local web server (npm start), or open the hosted site. Then reload the page.';
    $('question-card').setAttribute('aria-busy', 'false');
    console.error(error);
  }
}
init();
