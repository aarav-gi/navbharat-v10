'use strict';

/**
 * Government job posts, results, admit cards, syllabus and answer keys are
 * genuinely different content types with different required fields (Phase
 * 15 CMS). Rather than one form dumping every field on every category,
 * this shows/hides + enables/disables field groups based on the selected
 * category so, e.g., a Result post only ever asks for a description and a
 * PDF link — never total vacancies, age limit or a fee matrix.
 *
 * Disabling (not just hiding) the fields in inactive sections matters:
 * disabled form fields are excluded from submission entirely, so reused
 * field names (e.g. "notificationPdf" doubles as "Result PDF" and "Answer
 * Key PDF" in different sections) never collide into an array value.
 */

const CATEGORY_HINTS = {
  'latest-jobs': {
    title: 'Post Full Title *',
    titlePlaceholder: 'e.g. SSC CGL 2026 Combined Graduate Level Recruitment',
    desc: 'Short Information — a 2-3 line notification summary shown at the top of the post.'
  },
  'admit-card': {
    title: 'Exam / Admit Card Name *',
    titlePlaceholder: 'e.g. SSC CGL Tier 1 Admit Card 2026',
    desc: 'Short note — exam date, shift timing, or any instructions candidates should see first.'
  },
  results: {
    title: 'Exam / Post Name this result is for *',
    titlePlaceholder: 'e.g. RRB Group D Result 2026',
    desc: 'Result summary — this description is the entire visible content of the result page, so make it complete (who, which exam, what was declared).'
  },
  'answer-key': {
    title: 'Exam / Post Name this answer key is for *',
    titlePlaceholder: 'e.g. SSC CHSL Tier 1 Answer Key 2026',
    desc: 'Answer key summary — release date and the objection/challenge window, if any.'
  },
  syllabus: {
    title: 'Exam / Post Name this syllabus is for *',
    titlePlaceholder: 'e.g. UPSC Civil Services Syllabus 2026',
    desc: 'Short note about the syllabus and exam pattern.'
  }
};

function applyCategoryUI() {
  const select = document.getElementById('categorySelect');
  if (!select) return;
  const cat = select.value;

  document.querySelectorAll('.cat-section').forEach(section => {
    const show = section.dataset.cats.split(',').includes(cat);
    section.style.display = show ? '' : 'none';
    section.querySelectorAll('input, textarea, select').forEach(el => { el.disabled = !show; });
  });

  const hint = CATEGORY_HINTS[cat] || CATEGORY_HINTS['latest-jobs'];
  const titleLabel = document.getElementById('titleLabel');
  const titleInput = document.getElementById('titleInput');
  const descHint = document.getElementById('descHint');
  if (titleLabel) titleLabel.textContent = hint.title;
  if (titleInput) titleInput.placeholder = hint.titlePlaceholder;
  if (descHint) descHint.textContent = hint.desc;
}

document.addEventListener('DOMContentLoaded', () => {
  applyCategoryUI();
  const select = document.getElementById('categorySelect');
  if (select) select.addEventListener('change', applyCategoryUI);
});
