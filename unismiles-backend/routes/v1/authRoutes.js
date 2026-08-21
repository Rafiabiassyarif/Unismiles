const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const { verifyToken } = require('../../middlewares/authMiddleware');
const { createRateLimiter } = require('../../utils/security');

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get JWT
 */
router.post('/login', createRateLimiter({ windowMs: 15 * 60_000, max: 20 }), authController.login);

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (admin/invite-only — disabled for public use)
 *
 * Registration is intentionally left in the controller but should NOT be
 * exposed as a public route. If you need to create users, do it through the
 * admin panel or directly in the database.
 */
// router.post('/register', createRateLimiter({ windowMs: 60 * 60_000, max: 3 }), authController.register);

const userModel = require('../../models/userModel');

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user profile from database
 */
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found in database'
      });
    }

    // Ensure role normalization matches dashboard expectations
    let normalizedRole = user.role;
    if (normalizedRole === 'admin') normalizedRole = 'Super Admin';
    else if (normalizedRole === 'operator') normalizedRole = 'Admin Mitra';
    user.role = normalizedRole;

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        partner_name: user.partner_name
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
