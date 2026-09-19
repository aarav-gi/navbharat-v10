'use strict';

const postsRepo = require('../../modules/posts/repository');
const { sanitizeExternalUrl } = require('../../security/sanitize');
const cache = require('../../cache/memoryCache');

exports.ingestPost = (req, res) => {
  try {
    const b = req.body || {};

    if (!b.title || !String(b.title).trim()) {
      return res.status(400).json({ success: false, message: "Missing required field: title" });
    }
    if (!b.category || !String(b.category).trim()) {
      return res.status(400).json({ success: false, message: "Missing required field: category" });
    }

    const payload = {
      category: String(b.category).trim(),
      title: String(b.title).trim(),
      organization: String(b.organization || "").trim(),
      description: String(b.description || "").trim(),
      totalPosts: String(b.totalPosts || b.total_posts || "").trim(),
      applicationStart: b.applicationStart || b.application_start || null,
      applicationEnd: b.applicationEnd || b.application_end || null,
      ageLimit: b.ageLimit || b.age_limit || null,
      qualifications: b.qualifications || null,
      feeStructure: Array.isArray(b.feeStructure) ? b.feeStructure : [],
      importantDates: Array.isArray(b.importantDates) ? b.importantDates : [],
      vacancyTitle: String(b.vacancyTitle || b.vacancy_title || "").trim(),
      vacancies: Array.isArray(b.vacancies) ? b.vacancies : [],
      links: Array.isArray(b.links) ? b.links : [],
      books: Array.isArray(b.books) ? b.books : [],
      applyUrl: sanitizeExternalUrl(b.applyUrl || b.apply_url),
      notificationPdf: sanitizeExternalUrl(b.notificationPdf || b.notification_pdf),
      syllabusPdf: sanitizeExternalUrl(b.syllabusPdf || b.syllabus_pdf),
      bannerImage: b.bannerImage || b.banner_image || null,
      status: b.status === "published" ? "published" : "pending",
      recheckAt: b.recheckAt || null
    };

    const newPost = postsRepo.create(payload, 1);

    cache.invalidate("posts:");
    cache.invalidate("page:");

    return res.status(201).json({
      success: true,
      message: "Post ingested successfully",
      post: {
        id: newPost.id,
        slug: newPost.slug,
        status: newPost.status
      }
    });
  } catch (err) {
    console.error("[Ingestion API Error]:", err);
    return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
};
