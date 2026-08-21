const userModel = require('../models/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * Auth Controller
 * Handles user registration and authentication.
 */
const authController = {
  /**
   * @desc    Authenticate user & get token
   * @route   POST /api/auth/login
   * @access  Public
   */
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password || typeof email !== 'string' || typeof password !== 'string' || password.length > 256) {
        res.status(400);
        throw new Error('Please provide email and password');
      }

      const user = await userModel.findByEmail(email);
      if (!user) {
        res.status(401);
        throw new Error('Invalid email or password');
      }

      if (user.status && String(user.status).toLowerCase() !== 'active') {
        res.status(403);
        throw new Error('Account is inactive');
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        res.status(401);
        throw new Error('Invalid email or password');
      }

      // Normalize role string to database standard
      let normalizedRole = user.role;
      if (normalizedRole === 'admin') normalizedRole = 'Super Admin';
      else if (normalizedRole === 'operator') normalizedRole = 'Admin Mitra';

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, role: normalizedRole, partner_name: user.partner_name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
      );

      res.status(200).json({
        success: true,
        token,
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: normalizedRole,
          partner_name: user.partner_name
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Register a new user (used for initial setup or Admin invites)
   * @route   POST /api/auth/register
   * @access  Public
   */
  register: async (req, res, next) => {
    try {
      if (process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
        return res.status(403).json({ success: false, message: 'Public registration is disabled.' });
      }
      let { full_name, email, password, role, partner_name } = req.body;
      if (!full_name || !email || !password || !role || password.length < 10 || password.length > 256) {
        res.status(400);
        throw new Error('Please provide full_name, email, password, and role');
      }

      if (role === 'admin') role = 'Super Admin';
      else if (role === 'operator') role = 'Admin Mitra';
      if (!['Admin Mitra'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid registration role.' });
      }

      const existingUser = await userModel.findByEmail(email);
      if (existingUser) {
        res.status(409);
        throw new Error('Email already in use');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      const newUser = await userModel.create({
        full_name,
        email,
        password_hash,
        role,
        partner_name
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authController;
