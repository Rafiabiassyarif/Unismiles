const gestureModel = require('../models/gestureModel');

/**
 * Gesture Controller
 * Handles HTTP requests for Gesture logging endpoints.
 */
const gestureController = {
  /**
   * @desc    Log a new gesture
   * @route   POST /api/gestures
   * @access  Public
   */
  logGesture: async (req, res, next) => {
    try {
      const { session_id, gesture_type, confidence_score, action_triggered } = req.body;

      if (!session_id || !gesture_type) {
        res.status(400);
        throw new Error('Please provide session_id and gesture_type');
      }

      const newLog = await gestureModel.logGesture({
        session_id,
        gesture_type,
        confidence_score: confidence_score || null,
        action_triggered: action_triggered || null
      });

      return res.status(201).json({
        success: true,
        message: 'Gesture logged successfully',
        data: newLog
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Get all gesture logs
   * @route   GET /api/gestures
   * @access  Public (or Admin)
   */
  getAllGestures: async (req, res, next) => {
    try {
      const gestures = await gestureModel.getAllGestures();
      return res.status(200).json({
        success: true,
        count: gestures.length,
        data: gestures
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = gestureController;
