const userModel = require('../models/userModel');

/**
 * User Controller
 * Handles HTTP requests/responses for User management endpoints (Admin Dashboard).
 */
const userController = {
  /**
   * @desc    Get all users (excluding passwords)
   * @route   GET /api/users
   * @access  Public (or Admin)
   */
  getAllUsers: async (req, res, next) => {
    try {
      const users = await userModel.getAllUsers();
      return res.status(200).json({
        success: true,
        count: users.length,
        data: users
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Get single user by ID (excluding password)
   * @route   GET /api/users/:id
   * @access  Public (or Admin)
   */
  getUserById: async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400);
        throw new Error('User ID is required.');
      }

      const user = await userModel.getUserById(id);

      if (!user) {
        res.status(404);
        throw new Error(`User not found with ID: ${id}`);
      }

      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Update user details (name, email, role, partner_name)
   * @route   PUT /api/users/:id
   * @access  Public (or Admin)
   */
  updateUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, email, role, partner_name } = req.body;

      if (!id) {
        res.status(400);
        throw new Error('User ID is required.');
      }

      if (!name || !email || !role) {
        res.status(400);
        throw new Error('Please provide name, email, and role.');
      }

      // Check if user exists first
      const existingUser = await userModel.getUserById(id);
      if (!existingUser) {
        res.status(404);
        throw new Error(`User not found with ID: ${id}`);
      }

      // Check if updated email conflicts with another existing user
      if (email !== existingUser.email) {
        const emailCheck = await userModel.findUserByEmail(email);
        if (emailCheck && String(emailCheck.id) !== String(id)) {
          res.status(409);
          throw new Error('Email is already in use by another user.');
        }
      }

      await userModel.updateUser(id, { name, email, role, partner_name });

      const updatedUser = await userModel.getUserById(id);

      return res.status(200).json({
        success: true,
        message: 'User updated successfully.',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Delete a user by ID
   * @route   DELETE /api/users/:id
   * @access  Public (or Admin)
   */
  deleteUser: async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400);
        throw new Error('User ID is required.');
      }

      const existingUser = await userModel.getUserById(id);
      if (!existingUser) {
        res.status(404);
        throw new Error(`User not found with ID: ${id}`);
      }

      await userModel.deleteUser(id);

      return res.status(200).json({
        success: true,
        message: `User with ID ${id} deleted successfully.`
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = userController;
