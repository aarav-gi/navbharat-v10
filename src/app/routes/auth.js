'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { LOGIN } = require('../../security/rateLimits');

router.get('/', authController.showLogin);
router.post('/login', LOGIN, authController.login);
router.get('/logout', authController.logout);

module.exports = router;
