const broadcastCtrl = require('../controllers/adminBroadcastController');
const upload = require('../../middleware/upload');
'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth, requirePermission } = require('../../auth/rbac');
const { ADMIN } = require('../../security/rateLimits');
const postsCtrl = require('../controllers/adminPostsController');
const miscCtrl = require('../controllers/adminMiscController');
const postsRepo = require('../../modules/posts/repository');

router.use(ADMIN);
router.use(requireAuth); // everything below requires a valid session

// Scoped here rather than the global server.js middleware (see bug #1 fix)
// — this was previously running a DB query on every single public request
// (home, category, post, search) for a value only ever shown in the admin
// nav badge and dashboard. Still fresh per admin request, just no longer
// paid for by anonymous traffic too.
router.use((req, res, next) => {
  res.locals.pendingCount = postsRepo.getPending().length;
  next();
});

router.get('/', (req, res) => res.redirect((res.locals.secretUrl || '') + '/dashboard'));
router.get('/dashboard', miscCtrl.dashboard);

router.get('/posts', requirePermission('posts.read'), postsCtrl.listPosts);
router.get('/queue', requirePermission('posts.read'), postsCtrl.listQueue);

router.get('/broadcast', requirePermission('posts.create'), broadcastCtrl.showBroadcastPage);
router.post('/broadcast/send', requirePermission('posts.create'), upload.single('banner'), broadcastCtrl.sendBroadcast);

router.get('/new', requirePermission('posts.create'), postsCtrl.showNew);
router.post('/create', requirePermission('posts.create'), postsCtrl.create);
router.get('/edit/:source/:id', requirePermission('posts.edit'), postsCtrl.showEdit);
router.get('/posts/:id/edit', requirePermission('posts.edit'), postsCtrl.showEdit);
router.get('/edit/:id', requirePermission('posts.edit'), postsCtrl.showEdit);
router.post('/update', requirePermission('posts.edit'), postsCtrl.update);
router.post('/delete', requirePermission('posts.delete'), postsCtrl.remove);

router.post('/queue/approve', requirePermission('posts.approve'), postsCtrl.approve);
router.post('/queue/approve-all', requirePermission('posts.approve'), postsCtrl.approveAll);
router.post('/queue/reject', requirePermission('posts.approve'), postsCtrl.reject);

router.get('/settings', requirePermission('settings.manage'), miscCtrl.showSettings);
router.post('/settings', requirePermission('settings.manage'), miscCtrl.saveSettings);

router.get('/ads', requirePermission('ads.manage'), miscCtrl.showAds);
router.post('/ads', requirePermission('ads.manage'), miscCtrl.saveAds);

router.get('/analytics', requirePermission('analytics.read'), miscCtrl.showAnalytics);

router.get('/trending', requirePermission('analytics.read'), miscCtrl.showTrending);
router.post('/trending', requirePermission('settings.manage'), miscCtrl.saveTrendingWeights);
router.post('/trending/recompute', requirePermission('settings.manage'), miscCtrl.recomputeTrendingNow);
router.get('/audit', requirePermission('audit.read'), miscCtrl.showAudit);


router.get('/api-key', requirePermission('settings.manage'), miscCtrl.showApiKey);
router.post('/api-key/regenerate', requirePermission('settings.manage'), miscCtrl.regenerateApiKey);

module.exports = router;
