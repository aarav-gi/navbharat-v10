'use strict';

const crypto = require('crypto');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');
const db = require('../../database/connection');
const parser = require('./parser');
const robots = require('./robots');

// Many state government sites run outdated TLS stacks (expired chains,
// legacy cipher suites) that a modern Node TLS default will refuse to
// negotiate at all. These are read-only GETs of public notice pages —
// no credentials or form submissions ever go over this agent — so the
// original project's call to relax verification for reachability is kept.
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  ciphers: 'DEFAULT:@SECLEVEL=0'
});

const BROWSER_HEADERS = {
  'User-Agent': `Mozilla/5.0 (compatible; ${robots.UA_TOKEN}/1.0; +official-source-aggregator) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
  'Connection': 'close'
};

const POLITE_DELAY_MS = 2000;       // minimum gap between requests to the same crawl cycle
const MAX_RETRIES = 2;              // per-request retry budget, on top of the first attempt
const RETRY_BASE_DELAY_MS = 1500;   // exponential backoff base

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 1. DATE PARSING & OLD NOTIFICATION CHECK
function parseDateSafely(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  let day = parseInt(m[1], 10);
  let month = parseInt(m[2], 10) - 1;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

// 60 Din se purana notice ya beeti hui application date block hogi
function isOldOrExpired(title, href, category, extractedLastDate) {
  const now = new Date();
  const maxAgeMs = 60 * 24 * 60 * 60 * 1000; // 60 Days threshold

  // A. Archive URL check
  if (/(?:archive|archived|old-notices|past-exams|previous-year)\b/i.test(href)) {
    return { isOld: true, reason: 'Archive URL' };
  }

  // B. Old Years in Title (2015 - 2024)
  if (/\b(201\d|202[0-4])\b/.test(title)) {
    // Agar Job hai aur saal 2024 ya purana hai to pakka expired hai
    if (category === 'Latest Jobs') {
      return { isOld: true, reason: 'Old recruitment year' };
    }
  }

  // C. Title me mention notice date check (e.g., "(10-02-2025)" or "(05-04-2024)")
  const titleDateMatch = title.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
  if (titleDateMatch) {
    const noticeDate = parseDateSafely(titleDateMatch[1]);
    if (noticeDate) {
      const ageDiff = now.getTime() - noticeDate.getTime();
      // Agar notice date 60 din se zyada purani hai
      if (ageDiff > maxAgeMs) {
        return { isOld: true, reason: `Old notice date (${titleDateMatch[1]})` };
      }
    }
  }

  // D. Job Last Date / Closing Date passed
  if (category === 'Latest Jobs' && extractedLastDate) {
    const deadline = parseDateSafely(extractedLastDate);
    if (deadline) {
      // Set to end of deadline day
      deadline.setHours(23, 59, 59);
      if (deadline.getTime() < now.getTime()) {
        return { isOld: true, reason: `Application closed on ${extractedLastDate}` };
      }
    }
  }

  return { isOld: false };
}

// 2. GENERIC TITLES & JUNK BLACKLIST
const GENERIC_TITLE_BLACKLIST = [
  'special notice on examination', 'notice on examination', 'important notice',
  'public notice', 'special notice', 'examination notice', 'general notice',
  'click here', 'download notice', 'view details', 'corrigendum', 'press note',
  'circular', 'announcement', 'सूचना', 'महत्वपूर्ण सूचना', 'आवश्यक सूचना', 'प्रेस नोट'
];

function isGenericGarbageTitle(title) {
  const clean = title.toLowerCase().replace(/[0-9\/\-().:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (GENERIC_TITLE_BLACKLIST.includes(clean)) return true;
  const words = clean.split(' ').filter(w => w.length > 2);
  return words.length < 2;
}

const JUNK_PATTERNS = [
  /\b(?:e-)?call[\s-]*letters?\b/i,
  /\bobjection[\s-]*tracker\b/i,
  /\braise[\s-]*objection\b/i,
  /\bdocument[\s-]*verification\b/i,
  /\bmedical[\s-]*examination\b/i,
  /\btyping[\s-]*test\b/i,
  /\bskill[\s-]*test\b/i,
  /\bcandidature[\s-]*cancell?ed\b/i,
  /\brejection[\s-]*list\b/i,
  /\bdebarred\b/i,
  /\btender\b/i, /\bनिविदा\b/i, /\bquotation\b/i, /\bauction\b/i,
  /\bholiday\b/i, /\bअवकाश\b/i, /\btransfer\b/i, /\bकार्यालय[\s-]*आदेश\b/i,
  /\bseniority[\s-]*list\b/i, /\brti\b/i
];

function isJunkNotice(title, href) {
  const t = title.trim();
  const h = href.toLowerCase();
  for (const p of JUNK_PATTERNS) {
    if (p.test(t) || p.test(h)) return true;
  }
  return false;
}

const GENUINE_KEYWORDS = [
  'recruitment', 'vacancy', 'vacancies', 'post', 'posts', 'bharti', 'भर्ती',
  'रिक्ति', 'रिक्तियां', 'विज्ञापन', 'online form', 'apply online', 'notification',
  'officer', 'constable', 'inspector', 'clerk', 'assistant', 'engineer',
  'teacher', 'professor', 'technician', 'pilot', 'apprentice', 'nurse',
  'result', 'परिणाम', 'रिजल्ट', 'merit list', 'cut off', 'cutoff', 'score card',
  'admit card', 'प्रवेश पत्र', 'exam date', 'परीक्षा तिथि', 'hall ticket',
  'answer key', 'उत्तर कुंजी', 'syllabus', 'पाठ्यक्रम'
];

function isGenuineCandidateNotice(title) {
  const t = title.toLowerCase();
  return GENUINE_KEYWORDS.some(kw => t.includes(kw));
}

function detectCategory(title) {
  const t = title.toLowerCase();
  if (t.includes('result') || t.includes('परिणाम') || t.includes('रिजल्ट') || t.includes('merit') || t.includes('cut off') || t.includes('cutoff')) {
    return 'Result';
  }
  if (t.includes('admit card') || t.includes('प्रवेश पत्र') || t.includes('hall ticket') || t.includes('exam date') || t.includes('परीक्षा तिथि')) {
    return 'Admit Card';
  }
  if (t.includes('answer key') || t.includes('उत्तर कुंजी')) {
    return 'Answer Key';
  }
  if (t.includes('syllabus') || t.includes('पाठ्यक्रम')) {
    return 'Syllabus';
  }
  return 'Latest Jobs';
}

function tokenizeUniversal(str) {
  if (!str) return new Set();
  const tokens = str.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(w => w.length >= 2);
  return new Set(tokens);
}

function calculateSimilarity(titleA, titleB) {
  const setA = tokenizeUniversal(titleA);
  const setB = tokenizeUniversal(titleB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return Math.round((intersection / union) * 100);
}

function isDuplicateOfExisting(newTitle, existingTitles) {
  for (const existing of existingTitles) {
    const score = calculateSimilarity(newTitle, existing);
    if (score >= 65) {
      return { isDup: true, score, matched: existing };
    }
  }
  return { isDup: false, score: 0, matched: null };
}

function makeUnicodeSlug(title) {
  let base = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!base) base = 'notification';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function fetchOnce(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(urlStr);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.get(urlObj, {
        agent: isHttps ? httpsAgent : undefined,
        headers: BROWSER_HEADERS,
        timeout: timeoutMs
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const redirectUrl = new URL(res.headers.location, urlStr).toString();
          return resolve(fetchOnce(redirectUrl, timeoutMs));
        }

        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: () => Promise.resolve(buffer.toString('utf8')),
            buffer: () => Promise.resolve(buffer)
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timed out'));
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Retry wrapper with exponential backoff — a source that times out once
// under normal government-site latency shouldn't be marked failed for the
// whole cycle; a source that is consistently unreachable still surfaces as
// an error after the retry budget is spent.
async function fetchGov(urlStr, timeoutMs = 15000) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchOnce(urlStr, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr;
}

const insertPostStmt = db.prepare(`
  INSERT INTO posts (
    id, slug, category, title, organization, description,
    total_posts, application_start, application_end, age_limit,
    qualifications, fee_structure, vacancies, links, books,
    apply_url, notification_pdf, status, source_type,
    posted_date, duplicate_score, duplicate_of_title,
    created_at, updated_at
  ) VALUES (
    @id, @slug, @category, @title, @organization, @description,
    @total_posts, @application_start, @application_end, @age_limit,
    @qualifications, @fee_structure, @vacancies, @links, @books,
    @apply_url, @notification_pdf, 'pending', 'crawler',
    @posted_date, @duplicate_score, @duplicate_of_title,
    datetime('now'), datetime('now')
  )
`);

const markSourceHealth = db.prepare(`
  UPDATE crawler_sources
  SET last_run_at = datetime('now'),
      last_status = @status,
      last_error = @error,
      consecutive_failures = CASE WHEN @status = 'ok' THEN 0 ELSE consecutive_failures + 1 END,
      last_success_at = CASE WHEN @status = 'ok' THEN datetime('now') ELSE last_success_at END
  WHERE id = @id
`);

async function scanSource(source, globalSeenTitles) {
  console.log(`[Crawler] 🌐 Scanning: ${source.name} [${source.state || 'All-India'}]`);

  // Policy check first: an official source that disallows bots via
  // robots.txt is marked blocked and skipped rather than fetched anyway.
  let allowed = true;
  try {
    allowed = await robots.isAllowed(source.url);
  } catch (_) {
    allowed = true; // fail open — an unreachable robots.txt is not a disallow
  }
  if (!allowed) {
    console.log(`[Crawler] 🚫 Skipped (robots.txt disallows): ${source.name}`);
    markSourceHealth.run({ status: 'blocked_robots', error: 'Disallowed by robots.txt', id: source.id });
    return;
  }

  try {
    const res = await fetchGov(source.url);
    if (!res.ok) {
      console.log(`[Crawler] ⚠️ Source HTTP ${res.status}: ${source.name}`);
      markSourceHealth.run({ status: 'error', error: `HTTP ${res.status}`, id: source.id });
      return;
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const discovered = [];

    const baseUrlObj = new URL(source.url);
    const rootPath = baseUrlObj.pathname.toLowerCase();

    $('a').each((_, el) => {
      let rawTitle = $(el).text().trim().replace(/\s+/g, ' ');
      let href = $(el).attr('href');
      if (!href || rawTitle.length < 5) return;
      if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) return;

      try {
        href = new URL(href, source.url).toString();
      } catch (_) {
        return;
      }

      const hrefObj = new URL(href);
      if (hrefObj.pathname === '/' || hrefObj.pathname === rootPath || hrefObj.pathname === '/default.aspx') return;

      let fullTitle = rawTitle;
      const parentRow = $(el).closest('tr');
      if (parentRow.length > 0) {
        const rowText = parentRow.text().replace(/\s+/g, ' ').trim();
        if (isGenericGarbageTitle(rawTitle) && rowText.length > rawTitle.length) {
          fullTitle = `${source.name} - ${rowText.slice(0, 90)}`;
        }
      }

      if (isGenericGarbageTitle(fullTitle)) return;
      if (isJunkNotice(fullTitle, href)) return;
      if (!isGenuineCandidateNotice(fullTitle)) return;

      discovered.push({ title: fullTitle, href });
    });

    let newCount = 0;

    for (const item of discovered) {
      const contentHash = crypto.createHash('sha256').update(item.title + item.href).digest('hex');
      const seen = db.prepare('SELECT 1 FROM crawler_history WHERE content_hash = ?').get(contentHash);
      if (seen) continue;

      db.prepare("INSERT INTO crawler_history (content_hash, source_url, title, created_at) VALUES (?, ?, ?, datetime('now'))").run(
        contentHash, item.href, item.title
      );

      // Duplicate Check
      const dupCheck = isDuplicateOfExisting(item.title, globalSeenTitles);
      if (dupCheck.isDup) {
        continue; // Skip duplicate
      }

      const detectedCategory = detectCategory(item.title);
      const isDirectPdf = item.href.toLowerCase().endsWith('.pdf');
      let extracted = { lastDate: null, totalVacancies: null, fee: null, script: parser.detectScript(item.title) };

      if (isDirectPdf) {
        try {
          const fileRes = await fetchGov(item.href);
          const buf = await fileRes.buffer();
          extracted = await parser.parsePdf(buf);
        } catch (_) {}
      }

      if (!extracted.lastDate || !extracted.totalVacancies) {
        const titleMeta = parser.extractMetaFromText(item.title);
        extracted.lastDate = extracted.lastDate || titleMeta.lastDate;
        extracted.totalVacancies = extracted.totalVacancies || titleMeta.totalVacancies;
        extracted.fee = extracted.fee || titleMeta.fee;
      }

      // EXPIRY & OLD NOTICE GUARD
      const ageCheck = isOldOrExpired(item.title, item.href, detectedCategory, extracted.lastDate);
      if (ageCheck.isOld) {
        console.log(`[Crawler] ⏳ DROPPED OLD/EXPIRED (${ageCheck.reason}): "${item.title.slice(0, 40)}..."`);
        continue; // Block old notices completely
      }

      globalSeenTitles.push(item.title);

      const today = new Date().toISOString().split('T')[0];
      const postId = crypto.randomUUID();
      const slug = makeUnicodeSlug(item.title);

      const actionLabel = isDirectPdf
        ? `Download Official ${detectedCategory} PDF`
        : `Direct Official ${detectedCategory} Portal`;

      insertPostStmt.run({
        id: postId,
        slug,
        category: detectedCategory,
        title: item.title,
        organization: source.name,
        description: `Official ${detectedCategory} notification by ${source.name}. Click direct link for instructions.`,
        total_posts: extracted.totalVacancies ? String(extracted.totalVacancies) : (detectedCategory === 'Latest Jobs' ? 'Check Notification' : '-'),
        application_start: 'Available Now',
        application_end: extracted.lastDate || (detectedCategory === 'Latest Jobs' ? 'Refer Notice' : '-'),
        age_limit: 'As Per Rules',
        qualifications: 'Check Official Notification',
        fee_structure: extracted.fee ? `₹${extracted.fee}` : '-',
        vacancies: '[]',
        links: JSON.stringify([{ title: actionLabel, url: item.href }]),
        books: '[]',
        apply_url: item.href,
        notification_pdf: isDirectPdf ? item.href : null,
        posted_date: today,
        duplicate_score: 0,
        duplicate_of_title: null
      });

      newCount++;
      console.log(`[Crawler] 📥 Queued Fresh [${detectedCategory}]: "${item.title.slice(0, 42)}..."`);
    }

    markSourceHealth.run({ status: 'ok', error: null, id: source.id });
    console.log(`[Crawler] ✅ Completed ${source.name} (Added ${newCount} fresh notices)`);

  } catch (err) {
    console.error(`[Crawler] ⚠️ Error scanning ${source.name}:`, err.message);
    markSourceHealth.run({ status: 'error', error: err.message.slice(0, 500), id: source.id });
  }
}

let cycleRunning = false;

async function runCrawlCycle() {
  if (cycleRunning) {
    console.log('[Crawler] ⏭️  Skipped — a crawl cycle is already in progress.');
    return { skipped: true };
  }
  cycleRunning = true;
  const startedAt = Date.now();
  try {
    const rows = db.prepare('SELECT title FROM posts WHERE title IS NOT NULL').all();
    const globalSeenTitles = rows.map(r => r.title);

    const sources = db.prepare('SELECT * FROM crawler_sources WHERE active = 1').all();
    for (const src of sources) {
      await scanSource(src, globalSeenTitles);
      await sleep(POLITE_DELAY_MS);
    }
    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[Crawler] 🏁 Cycle complete — ${sources.length} source(s) in ${durationSec}s.`);
    return { skipped: false, sourceCount: sources.length, durationSec };
  } finally {
    cycleRunning = false;
  }
}

module.exports = { runCrawlCycle, isOldOrExpired, isCycleRunning: () => cycleRunning };
