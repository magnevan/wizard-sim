/* The place review's state rules, shared by the page (index.html loads it as whose.js) and the helper (review.mjs).
   One copy: the page and Claude must agree on whose move a task is.

   The db holds three collections:
   - tasks:   one doc per task, written once when it is made (by Claude or as the user's draft). Never updated.
   - events:  every change after that, appended, never edited: {at, by, task | decision, set?, note?, imgs?}.
              `set` merges fields into the task (status, ack, kind, area, zone, piece, outcome, waitingOn, waitingFor,
              title, body, evidence…); `note` adds to its thread; `seen` / `userSeen` are read receipts.
              For a decision, an event from Claude carries `seen` and/or `reply`.
   - answers: one doc per decision, the user's {choice, note, at}, written by the page.
   Folding the events in time order gives each task's state; nothing ever overwrites anyone else's write. */
(function (root) {
  const STATUS = { triage: 'Draft, to triage', open: 'To do', doing: 'In progress', waiting: 'Waiting', review: 'Check it', done: 'Done', wontfix: "Won't do" };
  const ORDER = ['review', 'triage', 'doing', 'waiting', 'open', 'done', 'wontfix'];
  const LIVE = new Set(['triage', 'open', 'doing', 'waiting', 'review']);

  const byAt = (a, b) => String(a.at || '').localeCompare(String(b.at || ''));

  // tasks: {id: doc}, events: [{id?, ...}] -> {id: state} with notes[] in order
  function fold(tasks, events) {
    const out = {};
    for (const [id, t] of Object.entries(tasks || {})) out[id] = { ...t, id, notes: [...(t.notes || [])] };
    for (const e of [...(events || [])].sort(byAt)) {
      if (!e.task || !out[e.task]) continue;
      const t = out[e.task];
      if (e.set) Object.assign(t, e.set);
      if (e.set && 'ack' in e.set) t.ackAt = e.at;
      if (e.set && ('waitingOn' in e.set || e.set.status === 'waiting')) t.waitingAt = e.at;
      if (e.note || (e.imgs || []).length) t.notes.push({ by: e.by, at: e.at, text: e.note || '', ...(e.imgs ? { imgs: e.imgs } : {}) });
      t.updated = e.at;
    }
    return out;
  }
  // answers: {id: doc}, events -> {id: {choice, note, at, seen, reply, replyAt}}
  function foldAnswers(answers, events) {
    const out = {};
    for (const [id, a] of Object.entries(answers || {})) out[id] = { ...a };
    for (const e of [...(events || [])].sort(byAt)) {
      if (!e.decision) continue;
      const a = (out[e.decision] ||= {});
      if (e.seen) a.seen = e.at;
      if (e.reply) { a.reply = e.reply; a.replyAt = e.at; a.seen = e.at; }
    }
    return out;
  }
  const lastBy = (t, who) => { const n = (t.notes || []).filter((x) => x.by === who); return n.length ? n[n.length - 1].at : ''; };
  const answered = (a) => !!a && !!(a.choice || a.note);
  // a task waiting on the user is answered once the user has acted on it since it started waiting: answered every
  // decision it names (`decision`, `decisions`), or acknowledged or noted on the task itself
  function answeredSince(t, answers) {
    const since = t.waitingAt || t.created || '';
    const decs = [t.decision, ...(t.decisions || [])].filter(Boolean);
    if (decs.length && decs.every((d) => answered((answers || {})[d]))) return true;
    if ((t.ackAt || '') > since) return true;
    return lastBy(t, 'user') > since;
  }
  // [whose move: 'you' | 'claude' | '', why]; pass the folded answers so answered decisions count
  function why(t, answers) {
    const st = t.status || 'open';
    if (st === 'triage') return ['claude', 'to triage'];
    if (st === 'review') return ['you', 'check it'];
    if (!LIVE.has(st)) return ['', ''];
    const u = lastBy(t, 'user'), c = lastBy(t, 'claude');
    if (u && u > c && !(t.seen && t.seen >= u)) return ['claude', 'your note'];
    if (t.ack === 'disagree' && !(c && c > (t.ackAt || ''))) return ['claude', 'you disagreed'];
    if (c && c > u && c > (t.userSeen || '')) return ['you', 'Claude replied'];
    if (st === 'waiting' && t.waitingOn === 'user') return answeredSince(t, answers) ? ['claude', 'you answered'] : ['you', 'waiting on you'];
    if (t.by !== 'user' && !t.ack) return ['you', 'acknowledge'];
    return ['', ''];
  }
  // a decision's answer waiting for Claude: answered (choice or note) after Claude last read it
  const answerUnread = (a) => !!a && !!(a.choice || a.note) && !(a.seen && a.seen >= (a.at || ''));
  const noteUnread = (t, n) => n.by === 'user' && !(t.seen && t.seen >= n.at) && !(lastBy(t, 'claude') > n.at);
  const eventId = (at, by) => at.replace(/[-:.TZ]/g, '').slice(2, 16) + '-' + by + '-' + Math.random().toString(36).slice(2, 6);

  const W = { STATUS, ORDER, LIVE, fold, foldAnswers, why, answered, lastBy, answerUnread, noteUnread, eventId };
  if (typeof module !== 'undefined' && module.exports) module.exports = W; else root.W = W;
})(typeof window !== 'undefined' ? window : globalThis);
