// Quiz check: runs the page's <script> with DOM stubs and validates the question data.
// Usage: node .claude/skills/quiz-questions/scripts/check-quiz.mjs [path to html]
/* global console, process */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2] ?? 'docs/quiz-stage-0.html';
const html = readFileSync(file, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
  console.error('No <script> found in', file);
  process.exit(1);
}

// Minimal DOM: the script only creates elements and attaches handlers
const el = () => ({
  addEventListener() {},
  appendChild() {},
  setAttribute() {},
  querySelectorAll: () => [],
  classList: { add() {}, contains: () => false },
  dataset: {},
  innerHTML: '',
  textContent: '',
  value: '',
});
const context = {
  document: {
    getElementById: el,
    createElement: el,
    addEventListener() {},
    querySelectorAll: () => [],
    activeElement: null,
  },
  console,
};
vm.createContext(context);
vm.runInContext(match[1] + '\n;globalThis.__Q = QUESTIONS;', context);
const questions = context.__Q;

const errors = [];
const warnings = [];
const seen = new Map();

questions.forEach((q, i) => {
  const id = 'FK-' + String(i + 1).padStart(3, '0');
  for (const key of ['topic', 'q', 'ex', 'level']) {
    if (!q[key]) errors.push(`${id}: missing field ${key}`);
  }
  if (q.stage === undefined) errors.push(`${id}: missing stage`);
  if (!['middle', 'senior'].includes(q.level)) errors.push(`${id}: level = ${q.level}`);
  if (!Array.isArray(q.opts) || q.opts.length !== 4) errors.push(`${id}: not exactly 4 options`);
  if (!(Number.isInteger(q.a) && q.a >= 0 && q.a < 4)) errors.push(`${id}: a = ${q.a}`);

  const key = (q.q || '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase();
  if (seen.has(key)) warnings.push(`${id}: same question text as ${seen.get(key)}`);
  else seen.set(key, id);

  // A bare "<" in HTML fields breaks the markup (generics, arrows). The code field needs no escaping
  for (const [field, text] of [
    ['q', q.q],
    ['ex', q.ex],
    ...(q.opts || []).map((o, k) => [`opts[${k}]`, o]),
  ]) {
    const bad = (text || '').match(/<(?!\/?(code|b|i|em|strong|br)\b)[^>]*>?/);
    if (bad) warnings.push(`${id}: ${field} looks like an unescaped "<": ${bad[0].slice(0, 30)}`);
  }

  // Length giveaway: the correct option is much longer than the others
  if (Array.isArray(q.opts) && q.opts.length === 4 && Number.isInteger(q.a)) {
    const len = (s) => s.replace(/<[^>]+>/g, '').length;
    const right = len(q.opts[q.a]);
    const others = q.opts.filter((_, k) => k !== q.a).map(len);
    if (right > Math.max(...others) * 1.4 && right - Math.max(...others) > 20) {
      warnings.push(`${id}: the correct option is much longer than the others (giveaway)`);
    }
  }
});

// Summary per stage: levels, topics, distribution of correct answers
const stages = [...new Set(questions.map((q) => q.stage))];
console.log(`Total questions: ${questions.length}`);
for (const s of stages) {
  const list = questions.filter((q) => q.stage === s);
  const first = questions.indexOf(list[0]) + 1;
  const last = questions.indexOf(list[list.length - 1]) + 1;
  const byLevel = (l) => list.filter((q) => q.level === l).length;
  const topics = {};
  list.forEach((q) => (topics[q.topic] = (topics[q.topic] || 0) + 1));
  const dist = [0, 1, 2, 3].map((k) => list.filter((q) => q.a === k).length);
  console.log(
    `Stage ${s}: ${list.length} (middle ${byLevel('middle')}, senior ${byLevel('senior')}), ` +
      `FK-${String(first).padStart(3, '0')}…FK-${String(last).padStart(3, '0')}`,
  );
  console.log(
    `  topics: ${Object.entries(topics)
      .map(([t, n]) => `${t} ${n}`)
      .join(', ')}`,
  );
  console.log(`  correct answers by position A/B/C/D: ${dist.join('/')}`);
}

warnings.forEach((w) => console.log('WARNING', w));
errors.forEach((e) => console.log('ERROR', e));
process.exit(errors.length ? 1 : 0);
