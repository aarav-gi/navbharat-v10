const { broadcastNewJob } = require('../../modules/broadcast/broadcastService');

function parseBooksFromForm(body) {
  const titles = Array.isArray(body['book_name[]']) ? body['book_name[]'] : (body['book_name[]'] ? [body['book_name[]']] : (Array.isArray(body.book_name) ? body.book_name : [body.book_name].filter(Boolean)));
  const prices = Array.isArray(body['book_price[]']) ? body['book_price[]'] : (body['book_price[]'] ? [body['book_price[]']] : (Array.isArray(body.book_price) ? body.book_price : [body.book_price].filter(Boolean)));
  const urls = Array.isArray(body['book_url[]']) ? body['book_url[]'] : (body['book_url[]'] ? [body['book_url[]']] : (Array.isArray(body.book_url) ? body.book_url : [body.book_url].filter(Boolean)));

  const books = [];
  for (let i = 0; i < titles.length; i++) {
    const title = (titles[i] || '').trim();
    const url = (urls[i] || '').trim();
    const price = (prices[i] || '').trim();
    if (title && url) {
      books.push({ title, price, url });
    }
  }
  return books;
}

'use strict';

const postsRepo = require('../../modules/posts/repository');
const { logAudit } = require('../middleware/audit');
const { parseFeeStructure, parseImportantDates, parseVacancies, parseLinks, sanitizeUrlField, VALID_CATEGORIES } = require('./helpers/postForm');

function listPosts(req, res) {
  res.render('admin/posts', { title: 'Manage Posts', posts: postsRepo.getPublished() });
}

function listQueue(req, res) {
  const posts = postsRepo.getPublished();
  const pendingItems = postsRepo.getPending();
  res.render('admin/queue', { title: 'Review Queue', posts, pendingItems });
}

function showEdit(req, res) {
  const { id } = req.params;
  const item = postsRepo.getById(id);
  if (!item) return res.redirect(`${res.locals.secretUrl}/posts`);
  const posts = postsRepo.getPublished();
  res.render('admin/post-edit', {
    title: 'Edit Post',
    posts,
    item,
    source: item.status === 'pending' ? 'queue' : 'live'
  });
}

function showNew(req, res) {
  res.render('admin/post-new', { user: req.user, title: 'Create Post', posts: postsRepo.getPublished() });
}

function validatePostInput(body) {
  const errors = [];
  if (!body.title || !body.title.trim()) errors.push('Title is required.');
  if (!body.organization || !body.organization.trim()) errors.push('Organization is required.');
  if (!VALID_CATEGORIES.includes(body.category)) errors.push('Invalid category.');
  return errors;
}

// Which field the public post page actually uses as "the" document link
// per category (mirrors src/views/post.ejs's catLabels docUrl mapping) —
// deliberately excludes latest-jobs, which has multiple legitimate link
// sources (Apply Online, notification PDF, extra links) rather than one
// single required field.
const REQUIRED_DOC_FIELD = {
  'admit-card': 'applyUrl',
  'results': 'notificationPdf',
  'answer-key': 'notificationPdf',
  'syllabus': 'syllabusPdf'
};

/** Prevents saving a Result/Answer-Key/Syllabus/Admit-Card post with no
 *  way to actually reach the document — the public page's fallback for
 *  that is a permanent "Link coming soon" with no way to add it later
 *  short of an edit. Any additional link in the links[] repeater also
 *  satisfies this, since that's a legitimate alternate place to put it. */
function validateCategoryRequiredFields(body, sanitizedUrls, links) {
  const requiredField = REQUIRED_DOC_FIELD[body.category];
  if (!requiredField) return [];
  if (sanitizedUrls[requiredField] || links.length > 0) return [];

  const FIELD_LABELS = { applyUrl: 'Apply/Download URL', notificationPdf: 'Notification/Result PDF URL', syllabusPdf: 'Syllabus PDF URL' };
  return [`${FIELD_LABELS[requiredField]} is required for this category (or add at least one link under Additional Links).`];
}

/** Builds the safe, correctly-typed object used to re-render the form
 *  after a validation failure — reflecting what the admin just typed
 *  (not stale saved data), with feeStructure/vacancies/links always
 *  arrays, never a raw JSON string that would crash post-edit.ejs's
 *  .forEach() calls. */
function buildReRenderItem(body, base) {
  return {
    ...base,
    category: body.category,
    title: body.title,
    organization: body.organization,
    description: (body.description || '').trim(),
    totalPosts: (body.totalPosts || '').trim(),
    applicationStart: body.applicationStart,
    applicationEnd: body.applicationEnd,
    ageLimit: body.ageLimit,
    qualifications: body.qualifications,
    feeStructure: parseFeeStructure(body),
    importantDates: parseImportantDates(body),
    vacancyTitle: (body.vacancyTitle || body.vacancy_title || "").trim(),
    vacancies: parseVacancies(body),
    links: parseLinks(body),
      books: parseBooksFromForm(body),
    applyUrl: sanitizeUrlField(body.applyUrl),
    notificationPdf: sanitizeUrlField(body.notificationPdf),
    syllabusPdf: sanitizeUrlField(body.syllabusPdf)
  };
}

function create(req, res) {
  const body = req.body || {};
  const sanitizedUrls = {
    applyUrl: sanitizeUrlField(body.applyUrl),
    notificationPdf: sanitizeUrlField(body.notificationPdf),
    syllabusPdf: sanitizeUrlField(body.syllabusPdf)
  };
  const links = parseLinks(body);

  const errors = [
    ...validatePostInput(body),
    ...validateCategoryRequiredFields(body, sanitizedUrls, links)
  ];
  if (errors.length) {
    return res.status(400).render('admin/post-new', {
      title: 'Create Post', posts: postsRepo.getPublished(), item: buildReRenderItem(body, {}), errors
    });
  }

  const post = postsRepo.create({
    category: body.category,
    title: body.title.trim(),
    organization: body.organization.trim(),
    description: (body.description || '').trim(),
    totalPosts: (body.totalPosts || '').trim(),
    applicationStart: body.applicationStart,
    applicationEnd: body.applicationEnd,
    ageLimit: body.ageLimit,
    qualifications: body.qualifications,
    feeStructure: parseFeeStructure(body),
    vacancies: parseVacancies(body),
    links,
    books: parseBooksFromForm(body),
    applyUrl: sanitizedUrls.applyUrl,
    notificationPdf: sanitizedUrls.notificationPdf,
    syllabusPdf: sanitizedUrls.syllabusPdf,
    bannerImage: req.file ? ('/uploads/' + req.file.filename) : null,
    recheckAt: body.recheck_at || null
  }, req.user.id);

  
    
  logAudit(req, { action: 'post.create', entityType: 'post', entityId: post.id, details: { title: post.title } });
  res.redirect(`${res.locals.secretUrl}/posts`);
}

function update(req, res) {
  const body = req.body || {};
  const { id, actionType } = body;
  const existing = postsRepo.getById(id);
  if (!existing) return res.redirect(`${res.locals.secretUrl}/posts`);

  const sanitizedUrls = {
    applyUrl: sanitizeUrlField(body.applyUrl),
    notificationPdf: sanitizeUrlField(body.notificationPdf),
    syllabusPdf: sanitizeUrlField(body.syllabusPdf)
  };
  const links = parseLinks(body);

  const errors = [
    ...validatePostInput(body),
    ...validateCategoryRequiredFields(body, sanitizedUrls, links)
  ];
  if (errors.length) {
    return res.status(400).render('admin/post-edit', {
      title: 'Edit Post',
      posts: postsRepo.getPublished(),
      item: buildReRenderItem(body, existing),
      source: body.source,
      errors
    });
  }

  const wantsPublish = actionType === 'publish_live';
  const canPublish = req.permissions && req.permissions.has('posts.publish');

  // Bug fix: previously, a user without posts.publish clicking "Save &
  // Publish" had the status silently stay unchanged with no feedback at
  // all — indistinguishable from success. Now it's a visible, non-fatal
  // warning: the rest of the edit still saves, but they're told plainly
  // that the publish step didn't happen.
  if (wantsPublish && !canPublish) {
    const updated = postsRepo.update(id, {
      category: body.category,
      title: body.title.trim(),
      organization: body.organization.trim(),
      description: (body.description || '').trim(),
      total_posts: (body.totalPosts || '').trim(),
      application_start: body.applicationStart,
      application_end: body.applicationEnd,
      age_limit: body.ageLimit,
      qualifications: body.qualifications,
      fee_structure: JSON.stringify(parseFeeStructure(body)),
      important_dates: JSON.stringify(parseImportantDates(body)),
      vacancy_title: (body.vacancyTitle || body.vacancy_title || "").trim(),
      vacancies: JSON.stringify(parseVacancies(body)),
      links: JSON.stringify(links),
      books: JSON.stringify(parseBooksFromForm(body)),
      apply_url: sanitizedUrls.applyUrl,
      notification_pdf: sanitizedUrls.notificationPdf,
      syllabus_pdf: sanitizedUrls.syllabusPdf,
      status: existing.status,
      recheck_at: body.recheck_at || null
    }, req.user.id);

    logAudit(req, { action: 'post.edit', entityType: 'post', entityId: id, details: { publishDenied: true } });
    return res.status(403).render('admin/post-edit', {
      title: 'Edit Post',
      posts: postsRepo.getPublished(),
      item: updated,
      source: body.source,
      errors: ['Your changes were saved, but you do not have permission to publish posts — the status was left unchanged. Ask an editor with publish rights to publish it.']
    });
  }

  const status = wantsPublish && canPublish ? 'published' : existing.status;

  const updated = postsRepo.update(id, {
    category: body.category,
    title: body.title.trim(),
    organization: body.organization.trim(),
    description: (body.description || '').trim(),
    total_posts: (body.totalPosts || '').trim(),
    application_start: body.applicationStart,
    application_end: body.applicationEnd,
    age_limit: body.ageLimit,
    qualifications: body.qualifications,
    fee_structure: JSON.stringify(parseFeeStructure(body)),
      important_dates: JSON.stringify(parseImportantDates(body)),
      vacancy_title: (body.vacancyTitle || body.vacancy_title || "").trim(),
    vacancies: JSON.stringify(parseVacancies(body)),
    links: JSON.stringify(links),
    books: JSON.stringify(parseBooksFromForm(body)),
    apply_url: sanitizedUrls.applyUrl,
    notification_pdf: sanitizedUrls.notificationPdf,
    syllabus_pdf: sanitizedUrls.syllabusPdf,
    status,
    recheck_at: body.recheck_at || null
  }, req.user.id);

  logAudit(req, { action: status === 'published' ? 'post.publish' : 'post.edit', entityType: 'post', entityId: id });
  res.redirect(status === 'published' ? `${res.locals.secretUrl}/posts` : `${res.locals.secretUrl}/queue`);
}

function remove(req, res) {
  const { id } = req.body;
  postsRepo.remove(id);
  logAudit(req, { action: 'post.delete', entityType: 'post', entityId: id });
  res.redirect(`${res.locals.secretUrl}/posts`);
}

function approve(req, res) {
  const { id } = req.body;
  postsRepo.approve(id, req.user.id);
  logAudit(req, { action: 'post.approve', entityType: 'post', entityId: id });
  res.redirect(`${res.locals.secretUrl}/queue`);
}

function approveAll(req, res) {
  const pending = postsRepo.getPending();
  pending.forEach(p => postsRepo.approve(p.id, req.user.id));
  logAudit(req, { action: 'post.approve_all', details: { count: pending.length } });
  res.redirect(`${res.locals.secretUrl}/posts`);
}

function reject(req, res) {
  const { id } = req.body;
  postsRepo.reject(id, req.user.id);
  logAudit(req, { action: 'post.reject', entityType: 'post', entityId: id });
  res.redirect(`${res.locals.secretUrl}/queue`);
}

module.exports = { listPosts, listQueue, showEdit, showNew, create, update, remove, approve, approveAll, reject };
