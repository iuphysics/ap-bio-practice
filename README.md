# Helix — AP Biology practice

A small, static study app containing the **126 exact questions** from the supplied 155-page AP Biology scoring guide: **95 MCQs and 31 FRQs**.

**Open the app:** https://iuphysics.github.io/ap-bio-practice/

GitHub Pages hosts the app independently of any local server. Changes pushed to `main` are published automatically. The `.nojekyll` file keeps the site as plain static files.

## Use it

With Node.js 20 or later installed:

```sh
npm start
```

Open **http://localhost:5173**. There are no packages to install, build steps, accounts, or API keys. Alternatively, serve this directory with any static HTTP server. Opening `index.html` directly through `file://` does not support the question-bank fetch.

## Practice

- Switch between multiple-choice and free-response questions.
- Shuffle question order without losing answers, or jump to an original question number.
- MCQs start unanswered. Selecting an option reveals correctness, the correct answer, and an optional original explanation. Your first answer is locked for the round.
- Write FRQ answers, then reveal the original scoring guide and mark your work as self-reviewed. FRQs are not automatically graded. Use paper for requested graphs and drawings.
- Progress, order, MCQ selections, and FRQ drafts are saved in this browser's local storage. They are not synchronized across devices. “Start a fresh round” clears only the selected mode after confirmation.
- Shared passages accompany each dependent question even after shuffling. Use “Enlarge” for the original question and options at a larger size.

## Source fidelity

Questions, figures, tables, mathematical notation, and scoring criteria are retained as lossless source crops. Simple prose options also have responsive text; their exact original crops remain available in the enlarged view. Correct-answer green backgrounds, borders, and check marks are removed from question assets before rendering. All 95 correct options are read from the source highlighting and checked against the written keys wherever supplied. The extraction audit is in `scripts/extraction-audit.json`.

The supplied PDF references absent model illustrations in questions 36 and 37; the app notes that source limitation. No missing diagrams or explanations have been invented. Some original scoring guides repeat their criteria; those repeats are preserved.

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
