const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

/**
 * @route   GET /api/users
 * @desc    Retrieve all users (exclude passwords)
 */
router.get('/', userController.getAllUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Retrieve a single user by ID (exclude password)
 */
router.get('/:id', userController.getUserById);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user details (name, email, role, partner_name)
 */
router.put('/:id', userController.updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete a user by ID
 */
router.delete('/:id', userController.deleteUser);

module.exports = router;
