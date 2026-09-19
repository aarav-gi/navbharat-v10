'use strict';

const { sanitizeExternalUrl } = require('../../../security/sanitize');

function toArray(val) {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

// NOTE: form fields use name="fee_label[]" etc., but express.urlencoded's
// extended:true parsing (the `qs` library) strips the "[]" and returns the
// value under the bracket-free key — qs.parse('a[]=x') is { a: ['x'] }, not
// { 'a[]': ['x'] }. Looking up body['fee_label[]'] was always undefined,
// which silently discarded every fee row, vacancy row, and extra link on
// every single create/update. Verified directly against the qs version
// this project's express depends on before fixing.
function parseImportantDates(body) {
  const labels = toArray(body.date_label || body["date_label[]"]);
  const values = toArray(body.date_val || body["date_val[]"] || body.date_value || body["date_value[]"]);
  const out = [];
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i] ? String(labels[i]).trim() : "";
    if (lbl) {
      out.push({
        label: lbl,
        value: values[i] !== undefined && values[i] !== null ? String(values[i]).trim() : ""
      });
    }
  }
  return out;
}

function parseFeeStructure(body) {
  const labels = toArray(body.fee_label);
  const amounts = toArray(body.fee_amount);
  const out = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] && String(labels[i]).trim()) {
      out.push({ label: String(labels[i]).trim(), amount: amounts[i] ? String(amounts[i]).trim() : 'Free' });
    }
  }
  return out;
}

function parseVacancies(body) {
  const posts = toArray(body.vac_post);
  const seats = toArray(body.vac_seats);
  const lastDates = toArray(body.vac_lastDate);
  const out = [];
  for (let i = 0; i < posts.length; i++) {
    if (posts[i] && String(posts[i]).trim()) {
      out.push({
        post: String(posts[i]).trim(),
        seats: seats[i] ? String(seats[i]).trim() : '',
        lastDate: lastDates[i] ? String(lastDates[i]).trim() : ''
      });
    }
  }
  return out;
}

/** Links with an unsafe URL scheme (javascript:, data:, etc.) are dropped
 *  entirely rather than saved with a blanked-out url — silently keeping a
 *  row with an empty href would just move the bug from "XSS" to "confusing
 *  dead link," and the admin typed something we can't trust either way. */
function parseLinks(body) {
  const names = toArray(body.link_name);
  const urls = toArray(body.link_url);
  const types = toArray(body.link_type);
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const safeUrl = sanitizeExternalUrl(urls[i]);
    if (safeUrl) {
      out.push({
        name: names[i] ? String(names[i]).trim() : 'Link',
        url: safeUrl,
        type: types[i] || 'secondary'
      });
    }
  }
  return out;
}

/** Same "drop rather than blank" rule for the single dedicated URL fields
 *  (applyUrl / notificationPdf / syllabusPdf). */
function sanitizeUrlField(raw) {
  return sanitizeExternalUrl(raw);
}

const VALID_CATEGORIES = ['latest-jobs', 'admit-card', 'results', 'answer-key', 'syllabus'];

module.exports = { parseImportantDates, parseFeeStructure, parseVacancies, parseLinks, sanitizeUrlField, VALID_CATEGORIES };
