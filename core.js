export function shuffle(ids, random = Math.random) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  // A deliberate shuffle should visibly change a nontrivial order.
  if (result.length > 1 && result.every((id, i) => id === ids[i])) result.push(result.shift());
  return result;
}

export function freshState(questions) {
  return { version: 1, mode: 'mcq', answers: {}, drafts: {}, revealed: {}, reviewed: {}, flagged: {},
    sessions: Object.fromEntries(['mcq', 'frq'].map(mode => [mode, {
      order: questions.filter(q => q.type === mode).map(q => q.id), index: 0, shuffled: false
    }])) };
}

export function restoreState(saved, questions) {
  const state = freshState(questions);
  if (!saved || saved.version !== 1) return state;
  if (['mcq', 'frq'].includes(saved.mode)) state.mode = saved.mode;
  for (const q of questions) {
    if (saved.flagged?.[q.id] === true) state.flagged[q.id] = true;
    if (q.type === 'mcq' && q.options.some(o => o.letter === saved.answers?.[q.id])) state.answers[q.id] = saved.answers[q.id];
    if (q.type === 'frq') {
      if (typeof saved.drafts?.[q.id] === 'string') state.drafts[q.id] = saved.drafts[q.id];
      if (state.drafts[q.id]?.trim() && saved.revealed?.[q.id] === true) state.revealed[q.id] = true;
      if (state.revealed[q.id] && saved.reviewed?.[q.id] === true) state.reviewed[q.id] = true;
    }
  }
  for (const mode of ['mcq', 'frq']) {
    const old = saved.sessions?.[mode];
    const ids = state.sessions[mode].order;
    if (Array.isArray(old?.order) && old.order.length === ids.length && new Set(old.order).size === ids.length && old.order.every(id => ids.includes(id))) {
      state.sessions[mode].order = old.order;
      state.sessions[mode].index = Number.isInteger(old.index) ? Math.max(0, Math.min(ids.length - 1, old.index)) : 0;
      state.sessions[mode].shuffled = old.shuffled === true;
    }
  }
  return state;
}
