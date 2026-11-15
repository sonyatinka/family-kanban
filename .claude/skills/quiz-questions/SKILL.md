---
name: quiz-questions
description: Add interview-style multiple-choice questions to the family-kanban learning quiz (docs/quiz-stage-0.html, published as the pinned artifact "Квиз «Семейный канбан»") after a project step or stage is finished, then validate and republish it. Use this whenever the user asks to make questions, a quiz, a self-check or "вопросы к этапу/шагу" for work done in this repo, to add them "к квизу", to fix or reword existing quiz questions, or to review the quiz for giveaways — even if they only say "сделай вопросы" or "добавь в квиз".
---

# Adding questions to the family-kanban quiz

The quiz is how the user (learning NestJS, Drizzle, React and production practices on this project) checks that they understood each step. A question is only useful if answering it requires the understanding the step was meant to build. A question that can be guessed from option length or wording teaches nothing.

## Where things are

- File: `docs/quiz-stage-0.html`. The name is historical. Keep the path, because republishing the same file keeps the artifact URL.
- Artifact: https://claude.ai/artifact/EJZ3Bd1qHTBtzmnGXW96KP (pinned in the user's sidebar).
- Validator: `node .claude/skills/quiz-questions/scripts/check-quiz.mjs`
- The header row `<p class="theory">` links to the theory pages (`docs/theory-*.html`, made with the `theory-notes` skill). Keep it when editing the header. If the step has a theory page, the questions should agree with it. Mention the page in your report.

Data lives in the `<script>` block:

| Array                            | Contents            | `level` / `stage`                                      |
| -------------------------------- | ------------------- | ------------------------------------------------------ |
| `QUESTIONS`                      | stage 0, middle     | set in the `forEach` below the arrays                  |
| `SENIOR`                         | stage 0, senior     | set in the `forEach`                                   |
| `STAGE1` (and later `STAGE2`, …) | one array per stage | `level` on each question, `stage` set by the `forEach` |

Below the arrays there is a block like this:

```js
QUESTIONS.forEach((q) => {
  q.level = 'middle';
  q.stage = 0;
});
SENIOR.forEach((q) => {
  q.level = 'senior';
  q.stage = 0;
  QUESTIONS.push(q);
});
STAGE1.forEach((q) => {
  q.stage = 1;
  QUESTIONS.push(q);
});
QUESTIONS.forEach((q, i) => {
  q.id = i;
});
```

Ticket numbers (FK-001…) come from the position in this combined list. The user may remember "I got FK-047 wrong", so **only ever append**:

- Next step of the latest stage: append to the end of that stage's array.
- New stage: create `STAGE<N>` after the last array and add its `forEach` push line last.
- Never insert in the middle or reorder. If an earlier stage needs more questions after a later stage exists, create a new array (for example `STAGE1_MORE` with `stage = 1`) pushed last.

The stage filter, the topic list per stage and the "latest stage by default" behavior derive from the data automatically. Only the header subtitle (`<p class="sub">`) has hand-written counts. Update it.

## Question format

```js
{
  level: 'middle',            // 'middle' or 'senior'
  topic: 'Drizzle',           // reuse existing topic names where they fit
  q: 'Текст вопроса с <code>кодом</code>',
  code: 'optional\nplain text snippet',   // escaped automatically, write < and > as is
  opts: ['A', 'B', 'C', 'D'],             // exactly 4, HTML allowed
  a: 2,                                   // index of the correct option in opts
  ex: 'Объяснение…',                      // HTML allowed
},
```

`q`, `opts` and `ex` are inserted as HTML. Write `&lt;` and `&gt;` for generics and arrows there (`Promise&lt;User&gt;`, `=&gt;`). Only `code` is escaped for you. Strings use single quotes, so escape apostrophes (`can\'t`). Option order is shuffled on screen, but still vary `a` so the source does not leak a pattern.

## Writing good questions

Language and style: Russian, matching the existing questions. Short, plain sentences, `<code>` for identifiers.

**Ground them in what was actually done.** Before writing, look at what the step changed: the diff or files, the decisions explained to the user, and any incidents along the way. An incident is often the best question, for example the stuck Docker port forward or a bug found in our own code. Middle questions should be answerable from this project's code and the explanations given. Senior questions take the same topic to production scale: concurrency, zero-downtime, scaling, failure modes, security.

Default mix per step: about 2/3 middle and 1/3 senior, 20–35 questions total, scaled to how much the step covered. Cover every concept the step introduced rather than piling onto one.

**Make the options do the work.**

- All four options should be plausible to someone who half-understands. Good distractors are the real misconceptions: confusing generate with migrate, thinking `@Global` exports everything, believing an interface makes Nest call a method.
- Keep options similar in length and form. The validator flags a correct option much longer than the rest, because that is the most common giveaway. Fix it by making distractors equally specific, not by stripping the correct answer of its reason.
- Avoid "all of the above", "none of the above" and joke options. Avoid absolute words only in wrong options.
- One option is unambiguously correct. If a distractor is "partly true", rewrite it.

**Explanations teach.** `ex` says why the correct answer is correct, and why the most tempting wrong option is wrong. Add a practical takeaway when there is one ("поэтому применённые миграции не правят"). Link to the project where it helps ("в нашем `DbModule` так и сделано").

**Verify facts you are not sure of**, such as library behavior, version-specific details or hook order. Check docs or the installed source in `node_modules` rather than writing from memory. A confidently wrong quiz answer is worse than no question. If writing a question reveals a flaw in the project's code (it has happened), tell the user and offer the fix instead of quietly keeping it in a question.

## Workflow

1. Gather what the step covered (conversation, diff, files). For a large step, list the concepts first.
2. Write the questions and append them following the rules above. Update the header subtitle counts.
3. Run the validator. It must exit 0. Then go through every warning:
   - "the correct option is much longer than the others" — rebalance the options.
   - "looks like an unescaped "<"" — escape it, or confirm it is a real allowed tag.
   - duplicate text — merge or rephrase.
     Also glance at the A/B/C/D distribution it prints for the stage.
4. Publish with the Artifact tool: `file_path: docs/quiz-stage-0.html`, `url:` the artifact URL above, and a short `label` (for example "Этап 1, шаг 2").
   - If this session has not read the live version, the publish is refused and a diff comes back. If the diff only shows your own edits plus the wrapper the service adds (`<!doctype>`, `<head>`, `</body></html>`), there is nothing to merge: publish again. If it shows other changes (the page was edited elsewhere), merge them into the local file first.
5. Report to the user in Russian: how many questions were added (middle/senior), the topics, the FK range, the link, and anything noteworthy found while writing (wrong facts in earlier questions, code issues).

If earlier questions describe code that has since changed, update their wording in the same pass. The quiz should match the current code.
