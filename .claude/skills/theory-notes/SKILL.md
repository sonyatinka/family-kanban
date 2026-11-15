---
name: theory-notes
description: Write a beginner-friendly theory page ("теория", "конспект", "вводный текст") in Russian for a step or stage of the family-kanban learning project, publish it as an artifact, and link it with the quiz both ways. Use this whenever the user asks for theory, an intro, an explanation page, a cheat sheet or "главное" about a topic covered in this repo (JWT, Drizzle, DI, families, invites, WebSockets…), or asks to check such a page for inaccuracies — even if they only say "сделай теорию к шагу" or "объясни этот этап текстом".
---

# Theory pages for family-kanban

The user is learning backend and frontend development on this project, and many topics are new to them. A theory page is what they read **before** the quiz: it builds the mental model the step relies on, in plain Russian, grounded in this project's real code. The quiz then checks that model. A theory page that overstates or simplifies something until it becomes false teaches the wrong model, which is worse than no page. Accuracy is the main quality bar.

## Where things are

- Reference page and template: `docs/theory-auth-tokens.html` (stage 1, step 3: JWT and refresh tokens), published at https://claude.ai/artifact/47zGqw4F6rzmAvPrvLgWmX. Copy its `<style>` block (tokens, light and dark themes, components) so all theory pages look like one series. The quiz uses the same palette and fonts.
- New pages: `docs/theory-<topic>.html`, one page and one artifact per step or topic, for example `docs/theory-families.html`. Republishing the same path keeps the URL.
- Quiz: `docs/quiz-stage-0.html`, https://claude.ai/artifact/EJZ3Bd1qHTBtzmnGXW96KP. Its header has a `<p class="theory">` row with links to all theory pages. That row is the list of existing pages.

## Before writing

1. Gather what the step actually did: the files, the decisions explained to the user, incidents found while testing, and what is planned for later steps.
2. Read the code you are going to describe. Every endpoint, file name, constant (TTL, cookie attributes, error codes) and code snippet on the page must match the current code. Check library behavior you are not sure of in `node_modules` or the docs.
3. Plan the sections. Go from the problem to the idea, then to how our code does it:
   - **Какую задачу решаем.** Why this is needed at all. Start from what the user already knows from earlier steps.
   - **Core concepts**, one section each. Explain, then show something concrete from our project: a real token from a test, a real SQL statement, a real response.
   - **A sequence**, if the topic has one (the life of a session, the path of a request, the steps of an invite). Number it only when the order is real information.
   - **Incidents from this step.** If testing found a bug, explain it. These are the most memorable lessons.
   - **Карта нашего кода:** endpoints (method, path, access, what it does) and the files with one line each. Point to `apps/api/requests.http` for trying things by hand.
   - **Частые заблуждения:** 4–6 myths, each with a short correction.
   - **Словарик:** the terms used on the page, in plain words.

## Writing

- Russian, short plain sentences, `<code>` for identifiers. Write for someone who meets the topic for the first time. Define every term at first use or in the glossary.
- Explain why before how. Each decision on the page should carry its reason ("15 минут — потому что отозвать нельзя").
- One "Главное" box (`.key`) per core idea at most. Use `.warn` for a limitation the reader could easily miss.
- Concrete over abstract: real values from our tests and code, not foo or bar.
- Mark anything that does not exist yet: "сделаем на шаге 6", "появится на этапе 5". Never describe planned behavior as if it already works.
- Keep it to the main points. If a nuance needs a paragraph, it probably belongs in a quiz explanation or a later page. A short `.muted` aside is fine for "схема упрощена".

## The accuracy pass

Before publishing, reread the whole page once, sentence by sentence, the way a strict reviewer would. These are the kinds of mistakes that slipped into the first theory page and were caught later by the user or by a review pass:

- **Overclaims.** "Можно отобрать пропуск" was true for the session but not for the access token. "Скрипт не украдёт токены" ignored that XSS can patch `fetch`. Look for absolute words ("нельзя", "никогда", "полностью", "только") and check that each one is literally true.
- **Imprecise scope.** "Cookie уходит только в /refresh и /logout" was wrong: `Path=/api/auth` sends it to every `/api/auth/*` request. Check paths, conditions and lists against the code.
- **Future described as present.** Frontend behavior written as if it existed before step 6.
- **Simplified diagrams presented as complete.** Say so when a diagram leaves things out.
- **Small technical details:** what exactly a signature is computed over, units (seconds or milliseconds), default values.

Fix what you find, then check that the quiz questions on the same topic don't contain the same mistake. If they do, fix them too, following the `quiz-questions` skill.

## Page build

- Start from the template's markup patterns: `header` with an eyebrow ("Семейный канбан · этап N · шаг M"), `h1`, `.lead`; a `nav.toc`; then `section`s with ids for the table of contents. Components: `.two` / `.box` comparisons, `.tablewrap` tables, `.timeline` sequences, `.flow` chains, `.parts` breakdowns, `dl` for file maps and the glossary, `.myth` rows.
- `<title>`: a name of the topic, 2–4 words, for example "Как устроен вход: JWT и refresh". Follow the Artifact tool's rules (quickstart for a new artifact, page contract, theme tokens, mobile width). With the copied style block, most of the contract is already met.
- Put a line under the lead linking to the quiz with the FK range for this step: `Проверить себя: <a href="…quiz URL…" target="_blank" rel="noopener">квиз «Семейный канбан»</a>, этап N, вопросы FK-xxx…FK-yyy.` If quiz questions for the step don't exist yet, say so and offer to write them with the `quiz-questions` skill.

## Publish and link

1. Publish the page with the Artifact tool. A new page gets `icon` and a one-sentence `description`. Note the URL.
2. Add the link to the quiz header row, in step order:
   ```html
   <p class="theory">
     <b>Теория:</b>
     <a href="…" target="_blank" rel="noopener">Этап 1, шаг 3 — JWT и refresh-токены</a>
     <a href="…" …>Этап 1, шаг 4 — …</a>
   </p>
   ```
   Run `node .claude/skills/quiz-questions/scripts/check-quiz.mjs`, then republish the quiz with its `url` and a short `label`.
3. Report to the user in Russian: the link, what the sections cover, and what you corrected in the accuracy pass. Suggest the order: theory first, then the quiz.
