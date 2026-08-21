const express = require('express');
const router = express.Router();
const filterController = require('../controllers/filterController');

/**
 * @route   GET /api/filters
 * @desc    Get all active filters
 */
router.get('/', filterController.getAllActiveFilters);

/**
 * @route   POST /api/filters
 * @desc    Create a new filter
 */
router.post('/', filterController.createFilter);

/**
 * @route   PUT /api/filters/:id
 * @desc    Update a specific filter by ID
 */
router.put('/:id', filterController.updateFilter);

/**
 * @route   DELETE /api/filters/:id
 * @desc    Delete a specific filter by ID
 */
router.delete('/:id', filterController.deleteFilter);

module.exports = router;
