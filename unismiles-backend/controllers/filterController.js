const filterModel = require('../models/filterModel');

/**
 * Filter Controller
 * Handles HTTP responses for Filter endpoints.
 */
const filterController = {
  /**
   * @desc    Get all active filters
   * @route   GET /api/filters
   * @access  Public
   */
  getAllActiveFilters: async (req, res, next) => {
    try {
      const filters = await filterModel.getAllActiveFilters();
      return res.status(200).json({
        success: true,
        count: filters.length,
        data: filters
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Create a new filter
   * @route   POST /api/filters
   * @access  Public (or Admin)
   */
  createFilter: async (req, res, next) => {
    try {
      const { name, css_filter, is_active } = req.body;

      if (!name || !css_filter) {
        res.status(400);
        throw new Error('Please provide all required fields: name, css_filter');
      }

      const newFilter = await filterModel.createFilter({ name, css_filter, is_active });

      return res.status(201).json({
        success: true,
        message: 'Filter created successfully.',
        data: newFilter
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Update a filter by ID
   * @route   PUT /api/filters/:id
   * @access  Public (or Admin)
   */
  updateFilter: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, css_filter, is_active } = req.body;

      if (!id) {
        res.status(400);
        throw new Error('Filter ID is required.');
      }

      if (!name || !css_filter) {
        res.status(400);
        throw new Error('Please provide required fields: name, css_filter');
      }

      const existingFilter = await filterModel.getFilterById(id);
      if (!existingFilter) {
        res.status(404);
        throw new Error(`Filter not found with ID: ${id}`);
      }

      await filterModel.updateFilter(id, { name, css_filter, is_active });

      const updatedFilter = await filterModel.getFilterById(id);

      return res.status(200).json({
        success: true,
        message: 'Filter updated successfully.',
        data: updatedFilter
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Delete a filter by ID
   * @route   DELETE /api/filters/:id
   * @access  Public (or Admin)
   */
  deleteFilter: async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400);
        throw new Error('Filter ID is required.');
      }

      const existingFilter = await filterModel.getFilterById(id);
      if (!existingFilter) {
        res.status(404);
        throw new Error(`Filter not found with ID: ${id}`);
      }

      await filterModel.deleteFilter(id);

      return res.status(200).json({
        success: true,
        message: `Filter with ID ${id} deleted successfully.`
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = filterController;
