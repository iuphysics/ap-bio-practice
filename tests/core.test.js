import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshState, restoreState, shuffle } from '../core.js';

const root = new URL('../', import.meta.url);
const { questions } = JSON.parse(readFileSync(new URL('questions.json', root), 'utf8'));

test('all original questions, types, valid keys, and necessary assets are present', () => {
  assert.deepEqual(questions.map(q => q.id), Array.from({ length: 126 }, (_, i) => i + 1));
  assert.equal(questions.filter(q => q.type === 'mcq').length, 95);
  assert.equal(questions.filter(q => q.type === 'frq').length, 31);
  for (const q of questions) {
    assert.ok(q.prompt.length);
    if (q.type === 'mcq') {
      assert.match(q.options.map(o => o.letter).join(''), /^ABCD(E)?$/);
      assert.ok(q.options.some(o => o.letter === q.correct));
      for (const o of q.options) assert.ok(o.images.length, `Question ${q.id} option ${o.letter}`);
    } else assert.ok(q.rubric.length);
    const assets = [...q.prompt, ...q.context, ...(q.explanation || []), ...(q.rubric || []), ...(q.options || []).flatMap(o => o.images)];
    for (const image of assets) {
      assert.ok(existsSync(fileURLToPath(new URL(image.src, root))), image.src);
      assert.ok(image.width > 0 && image.height > 0);
    }
    // Scoring content must not be present in the question/option text.
    for (const image of [...q.prompt, ...q.context, ...(q.options || []).flatMap(o => o.images)]) {
      assert.doesNotMatch(image.text, /Answer [A-E]\b|Student response earns|Select a point value|Correct\./, `Answer leak in ${image.src}`);
    }
  }
});

test('known source answers and shared passages survive extraction', () => {
  const byId = new Map(questions.map(q => [q.id, q]));
  for (const [id, answer] of [[1,'B'],[2,'C'],[3,'D'],[10,'A'],[14,'D'],[23,'C'],[84,'D'],[95,'D']]) assert.equal(byId.get(id).correct, answer);
  for (const [first,last] of [[16,19],[35,37],[41,44],[48,50]]) {
    for (let id = first; id <= last; id++) {
      assert.ok(byId.get(id).context.length);
      assert.deepEqual(byId.get(id).context, byId.get(first).context);
    }
  }
  for (const id of [1,9,33,66]) assert.ok(byId.get(id).options.every(o => o.graphical), `Graph options for ${id}`);
});

test('shuffled questions retain their exact shared source figures', () => {
  const byId = new Map(questions.map(q => [q.id, q]));
  const shuffled = shuffle(questions.filter(q => q.type === 'mcq').map(q => q.id), () => .37);
  for (const id of shuffled) {
    const q = byId.get(id);
    const expectedPage = id >= 16 && id <= 19 ? 13 : id >= 35 && id <= 37 ? 25 : id >= 41 && id <= 44 ? 30 : id >= 48 && id <= 50 ? 35 : null;
    assert.equal(q.context.length > 0, expectedPage !== null, `Context attached to Q${id}`);
    if (expectedPage) {
      assert.equal(q.contextSourcePage, expectedPage);
      assert.equal(q.context[0].page, expectedPage);
      assert.ok(q.contextLabel);
    }
  }
  for (const id of [35, 36, 37]) {
    const q = byId.get(id);
    assert.equal(q.context[0].src, 'assets/questions/context-35-p25.webp');
    assert.match(q.contextLabel, /Models 1, 2, and 3/);
    assert.ok(q.context[0].height > 500, 'Full model panel, including its legend');
    assert.equal(q.note, undefined, 'Do not claim that present source figures are missing');
  }
  assert.equal(byId.get(20).context.length, 0, 'CFTR question must not inherit the starch passage');
});

test('shuffle changes order, preserves every question, and does not mutate input', () => {
  const input = questions.filter(q => q.type === 'mcq').map(q => q.id);
  const saved = [...input];
  for (const random of [() => 0, () => .99999, Math.random]) {
    const result = shuffle(input, random);
    assert.notDeepEqual(result, input);
    assert.deepEqual([...result].sort((a,b) => a-b), input);
  }
  assert.deepEqual(input, saved);
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle([1]), [1]);
});

test('first visit has no revealed answers or rubrics', () => {
  const state = freshState(questions);
  assert.deepEqual(state.answers, {});
  assert.deepEqual(state.drafts, {});
  assert.deepEqual(state.revealed, {});
  assert.equal(state.sessions.mcq.order.length, 95);
  assert.equal(state.sessions.frq.order.length, 31);
});

test('restore retains valid progress and rejects corrupt cross-mode state', () => {
  const saved = freshState(questions);
  saved.mode = 'frq'; saved.answers[10] = 'A'; saved.answers[1] = 'Z';
  saved.drafts[96] = 'Proteins contain nitrogen.'; saved.revealed[96] = true; saved.reviewed[96] = true;
  saved.sessions.mcq.order = shuffle(saved.sessions.mcq.order);
  saved.sessions.mcq.index = 200;
  saved.sessions.frq.order[0] = 1;
  const restored = restoreState(saved, questions);
  assert.equal(restored.mode, 'frq'); assert.equal(restored.answers[10], 'A');
  assert.equal(restored.answers[1], undefined);
  assert.equal(restored.drafts[96], saved.drafts[96]); assert.equal(restored.reviewed[96], true);
  assert.deepEqual(restored.sessions.mcq.order, saved.sessions.mcq.order);
  assert.equal(restored.sessions.mcq.index, 94);
  assert.equal(restored.sessions.frq.order[0], 96);
  assert.deepEqual(restoreState({ version: 99 }, questions), freshState(questions));
  assert.deepEqual(restoreState(null, questions), freshState(questions));
});
