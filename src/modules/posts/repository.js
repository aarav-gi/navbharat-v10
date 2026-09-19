'use strict';

const crypto = require('crypto');
const db = require('../../database/connection');
const cache = require('../../cache/memoryCache');

// Public listing pages are read constantly and change rarely (only on
// admin publish/edit/approve/reject/delete), so they're the highest-value
// thing to cache. Short TTL keeps staleness bounded to a few seconds.
const LIST_TTL_MS = 30 * 1000;
const POST_TTL_MS = 60 * 1000;

const { sanitizeExternalUrl } = require('../../security/sanitize');

function parseJsonFields(row) {
  if (!row) return row;
  // Deliberately NOT `{ ...row, feeStructure: ... }` — spreading the raw
  // row first left the original snake_case fee_structure/vacancies/links
  // columns sitting on the object as their un-parsed JSON *strings*,
  // alongside the new parsed camelCase keys. Any code that reached for the
  // wrong-cased key (or a future `{...existing, ...body}` merge that
  // carried it along) would get a string where it expected an array and
  // crash on the first .forEach(). Building the object explicitly avoids
  // that ambiguity entirely — there is exactly one key per field now.
  return {
    banner_image: row.banner_image || null,
    id: row.id,
    slug: row.slug,
    category: row.category,
    title: row.title,
    organization: row.organization,
    status: row.status,
    sourceType: row.source_type,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    feeStructure: safeParse(row.fee_structure, []),
    importantDates: safeParse(row.important_dates, []),
    vacancyTitle: row.vacancy_title || "District-Wise Vacancy Details (जनपदवार रिक्तियां)",
    vacancies: safeParse(row.vacancies, []),
    links: safeParse(row.links, []).map(sanitizeLink).filter(Boolean),
    books: safeParse(row.books, []),
    description: row.description || '',
    totalPosts: row.total_posts,
    applicationStart: row.application_start,
    applicationEnd: row.application_end,
    ageLimit: row.age_limit,
    qualifications: row.qualifications,
    applyUrl: sanitizeExternalUrl(row.apply_url),
    notificationPdf: sanitizeExternalUrl(row.notification_pdf),
    syllabusPdf: sanitizeExternalUrl(row.syllabus_pdf),
    postedDate: row.posted_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recheck_at: row.recheck_at || null,
    recheckAt: row.recheck_at || null,
    is_recheck: row.is_recheck ? 1 : 0,
    isRecheck: Boolean(row.is_recheck)
  };
}

/** A link whose URL fails the http(s)-only check is dropped rather than
 *  rendered with a blanked-out href — same "drop, don't blank" rule as at
 *  write time (see postForm.js), applied again here for anything already
 *  in the database from before this check existed. */
function sanitizeLink(link) {
  const safeUrl = sanitizeExternalUrl(link && link.url);
  if (!safeUrl) return null;
  return { ...link, url: safeUrl };
}

function safeParse(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch (e) { return fallback; }
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const listByStatus = db.prepare('SELECT * FROM posts WHERE status = ? ORDER BY created_at DESC');
const listByStatusAndCategory = db.prepare('SELECT * FROM posts WHERE status = ? AND category = ? ORDER BY created_at DESC');
const findById = db.prepare('SELECT * FROM posts WHERE id = ?');
const findBySlug = db.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'");
const insertRevision = db.prepare('INSERT INTO post_revisions (post_id, snapshot, changed_by) VALUES (?, ?, ?)');
const deleteById = db.prepare('DELETE FROM posts WHERE id = ?');

function getPublished() {
  return cache.cached('posts:published', LIST_TTL_MS, () => listByStatus.all('published').map(parseJsonFields));
}

function getPublishedByCategory(category) {
  return cache.cached(`posts:published:${category}`, LIST_TTL_MS, () =>
    listByStatusAndCategory.all('published', category).map(parseJsonFields));
}

// Pending queue is admin-only, low-traffic, and needs to be fresh — not cached.
function getPending() {
  return listByStatus.all('pending').map(parseJsonFields);
}

// Admin edit screens need the freshest row, not cached.
function getById(id) {
  return parseJsonFields(findById.get(id));
}

function getBySlug(slug) {
  return cache.cached(`posts:slug:${slug}`, POST_TTL_MS, () => parseJsonFields(findBySlug.get(slug)));
}

/** Every write invalidates every cached listing/detail — correctness over
 *  cleverness. At this data volume a full-prefix wipe costs microseconds. */
function invalidateCaches() {
  cache.invalidate('posts:');
  cache.invalidate('page:'); // also drop cached full-page HTML (see cache/pageCache.js)
}

function generateUniqueSlug(baseTitle) {
  let baseSlug = slugify(baseTitle) || "post";
  let finalSlug = baseSlug;
  let counter = 1;
  while (db.prepare("SELECT id FROM posts WHERE slug = ?").get(finalSlug)) {
    finalSlug = `${baseSlug}-${counter}`;
    counter++;
  }
  return finalSlug;
}

function create(input, userId) {
  const id = crypto.randomUUID();
  const slug = generateUniqueSlug(input.title);
  db.prepare(`
    INSERT INTO posts (
      id, slug, category, title, organization, description, total_posts, application_start, application_end,
      age_limit, qualifications, fee_structure, important_dates, vacancy_title, vacancies, links, books, apply_url, notification_pdf, syllabus_pdf,
      status, source_type, created_by, updated_by, posted_date, banner_image, recheck_at, is_recheck
    ) VALUES (
      @id, @slug, @category, @title, @organization, @description, @total_posts, @application_start, @application_end,
      @age_limit, @qualifications, @fee_structure, @important_dates, @vacancy_title, @vacancies, @links, @books, @apply_url, @notification_pdf, @syllabus_pdf,
      'published', 'manual', @created_by, @created_by, @posted_date, @banner_image, @recheck_at, @is_recheck
    )
  `).run({
    id,
    slug,
    category: input.category,
    title: input.title,
    organization: input.organization,
    description: input.description || null,
    total_posts: input.totalPosts || null,
    application_start: input.applicationStart || 'Available Now',
    application_end: input.applicationEnd || null,
    age_limit: input.ageLimit || 'Check Notification',
    qualifications: input.qualifications || 'Check Notification',
    fee_structure: JSON.stringify(input.feeStructure || []),
    important_dates: typeof input.importantDates === "string" ? input.importantDates : JSON.stringify(input.importantDates || []),
    vacancy_title: input.vacancyTitle || input.vacancy_title || null,
    vacancies: JSON.stringify(input.vacancies || []),
    links: JSON.stringify(input.links || []),
    books: typeof input.books === 'string' ? input.books : JSON.stringify(input.books || []),
    apply_url: input.applyUrl || null,
    notification_pdf: input.notificationPdf || null,
    syllabus_pdf: input.syllabusPdf || null,
    created_by: userId,
    posted_date: new Date().toISOString(),
    banner_image: input.bannerImage || null,
    recheck_at: input.recheckAt || input.recheck_at || null,
    is_recheck: 0
  });
  invalidateCaches();
  return getById(id);
}

/** Every edit snapshots the previous row first (Phase 15 revision history). */
function update(id, fields, userId) {
  const existing = findById.get(id);
  if (!existing) return null;
  insertRevision.run(id, JSON.stringify(existing), userId);

  const merged = { ...existing, ...fields };
  const params = {
    id,
    category: merged.category,
    title: merged.title,
    organization: merged.organization,
    description: merged.description,
    total_posts: merged.total_posts,
    application_start: merged.application_start,
    application_end: merged.application_end,
    age_limit: merged.age_limit,
    qualifications: merged.qualifications,
    fee_structure: merged.fee_structure,
      important_dates: merged.important_dates,
      vacancy_title: merged.vacancy_title,
    vacancies: merged.vacancies,
    links: merged.links,
    books: typeof merged.books === 'string' ? merged.books : JSON.stringify(merged.books || []),
    apply_url: merged.apply_url,
    notification_pdf: merged.notification_pdf,
    syllabus_pdf: merged.syllabus_pdf,
    status: merged.status,
    recheck_at: (merged.recheck_at !== undefined ? merged.recheck_at : merged.recheckAt) || null,
    is_recheck: (merged.is_recheck !== undefined ? merged.is_recheck : merged.isRecheck) ? 1 : 0,
    updated_by: userId,
    updated_at: new Date().toISOString()
  };

  db.prepare(`
    UPDATE posts SET
      category = @category, title = @title, organization = @organization, description = @description,
      total_posts = @total_posts, application_start = @application_start, application_end = @application_end,
      age_limit = @age_limit, qualifications = @qualifications, fee_structure = @fee_structure, important_dates = @important_dates, vacancy_title = @vacancy_title,
      vacancies = @vacancies, links = @links, books = @books, apply_url = @apply_url, notification_pdf = @notification_pdf,
      syllabus_pdf = @syllabus_pdf, status = @status, recheck_at = @recheck_at, is_recheck = @is_recheck, updated_by = @updated_by, updated_at = @updated_at
    WHERE id = @id
  `).run(params);

  invalidateCaches();
  return getById(id);
}

function approve(id, userId) {
  return update(id, { status: 'published', is_recheck: 0, posted_date: new Date().toISOString() }, userId);
}

function reject(id, userId) {
  const existing = findById.get(id);
  if (!existing) return;
  insertRevision.run(id, JSON.stringify(existing), userId);
  db.prepare("UPDATE posts SET status = 'rejected', updated_by = ?, updated_at = datetime('now') WHERE id = ?").run(userId, id);
  invalidateCaches();
}

function remove(id) {
  deleteById.run(id);
  invalidateCaches();
}

module.exports = {
  getPublished, getPublishedByCategory, getPending, getById, getBySlug,
  create, update, approve, reject, remove, slugify
};
