# Helix — AP Biology practice

A small, static study app containing the **126 exact questions** from the supplied 155-page AP Biology scoring guide: **95 MCQs and 31 FRQs**.

**Open the app:** https://iuphysics.github.io/ap-bio-practice/

GitHub Pages hosts the app independently of any local server. Changes pushed to `main` are published automatically. The `.nojekyll` file keeps the site as plain static files.

## Use it

With Node.js 22.9 or later installed:

```sh
npm start
```

Open **http://localhost:5173**. Practice needs no packages, build steps, accounts, or API keys. The optional AI tutor requires the backend setup below. Alternatively, serve this directory with any static HTTP server for practice only. Opening `index.html` directly through `file://` does not support the question-bank fetch.

## Question-aware AI tutor

Use **Ask about this question** to open the chat. Each original question has a separate conversation, including after shuffling. On Send, the tutor receives that question's wording, original source images (including shared figures and graphical choices), selected answer or current FRQ draft, and recent chat. Hints are the default; enable **Allow answer explanations** to include the answer key/scoring guide. AI can make mistakes, and hints are not a guaranteed spoiler filter. Conversations and the class access code stay in page memory and reset on reload; requests are sent to your backend and OpenAI with `store: false` (this does not override provider retention policies).

GitHub Pages cannot run a secret-bearing backend. The panel ships disconnected until the owner deploys one:

1. Create a Render Blueprint from this repository using `render.yaml` (or deploy the Node server on another host).
2. In the host's secret environment settings, set `OPENAI_API_KEY` from an API project with billing enabled, and a strong, separate `TUTOR_ACCESS_CODE` to share only with intended students. Never put the API key in this repository or browser settings.
3. Set `OPENAI_MODEL` to an image-capable Responses API model available to your project. The supplied default is `gpt-6-astra`. Restrict `ALLOWED_ORIGINS` to the frontend origin and keep `QUESTION_SITE_URL` pointed at the public question assets.
4. Put the resulting HTTPS backend URL plus `/api/chat` into `tutor-config.json`'s `endpoint`, then commit/push that public configuration. For an individual browser test, enter that URL in **Tutor settings** instead.
5. Enter the separate class access code in Tutor settings. Test a question with a shared figure before sharing the site.

For local development, copy `.env.example` to `.env`, fill secrets locally, and run `npm start`. `.env` is ignored and the server only serves explicitly allowed public files. Do not paste keys into chat. No production key or backend is included.

The owner pays for API usage. Configure provider usage alerts/limits and monitor billing. The class code, origin checks, 10 requests/minute per server process and two concurrent requests reduce abuse but are not a hard spending cap or individual-user authentication. Limits reset on process restart; do not scale to multiple instances without a shared limiter. Rotate a leaked class code. Free hosting may sleep and delay the first reply.

## Practice

- Switch between multiple-choice and free-response questions.
- Shuffle question order without losing answers, or jump to an original question number.
- MCQs start unanswered. Selecting an option reveals correctness, the correct answer, and an optional original explanation. Your first answer is locked for the round.
- Write FRQ answers, then reveal the original scoring guide and mark your work as self-reviewed. FRQs are not automatically graded. Use paper for requested graphs and drawings.
- Progress, order, MCQ selections, and FRQ drafts are saved in this browser's local storage. They are not synchronized across devices. “Start a fresh round” clears only the selected mode after confirmation.
- Shared passages accompany each dependent question even after shuffling. Use “Enlarge” for the original question and options at a larger size.

## Source fidelity

Questions, figures, tables, mathematical notation, and scoring criteria are retained as lossless source crops. Simple prose options also have responsive text; their exact original crops remain available in the enlarged view. Correct-answer green backgrounds, borders, and check marks are removed from question assets before rendering. All 95 correct options are read from the source highlighting and checked against the written keys wherever supplied. The extraction audit is in `scripts/extraction-audit.json`.

Shared source panels are explicitly mapped to questions 16–19, 35–37, 41–44, and 48–50. In particular, the raster-only Models 1–3 on PDF page 25 accompany both questions 36 and 37 from page 26. Shared material opens automatically on each question, including after shuffling. No diagrams or explanations have been invented. Some original scoring guides repeat their criteria; those repeats are preserved.

The answer key is bundled client-side, suitable for self-study rather than secure exams. Answers are hidden in the study interface until a response is made, not protected against inspection of downloaded files.

The question material belongs to its respective rights holders. This app is for personal study. No license to redistribute the source question bank is granted. The original PDF is not included.

## Development and verification

```sh
npm test
npm run check
```

To regenerate the question bank from the original file:

```sh
python -m pip install -r scripts/requirements.txt
python scripts/extract_pdf.py /path/to/FILE_2835.pdf
```

This extractor is intentionally specific to this document. It checks question counts, option order, source highlights, written answer keys, and FRQ boundaries. It never changes the source PDF. Normal app use needs only the committed assets, not Python or the PDF.

The app is plain HTML/CSS/JavaScript and can be hosted on any static host. Publish only with appropriate permission to share the question material. The local server binds to loopback. Google Fonts are optional; system font fallbacks work without them.
