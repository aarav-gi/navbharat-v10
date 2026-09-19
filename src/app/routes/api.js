'use strict';

const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../../security/apiKeyAuth');
const apiPostController = require('../controllers/apiPostController');
const { API_INGEST } = require('../../security/rateLimits');

router.use(API_INGEST);
router.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));

router.post('/posts/ingest', apiKeyAuth, apiPostController.ingestPost);

router.get("/verify-key", apiKeyAuth, (req, res) => {
  res.json({
    success: true,
    siteName: "RozgarHub Production Portal (rozgarhub-v10)",
    status: "active",
    environment: process.env.NODE_ENV || "production",
    verifiedAt: new Date().toISOString()
  });
});

module.exports = router;
