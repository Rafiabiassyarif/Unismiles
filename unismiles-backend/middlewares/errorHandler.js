/**
 * Global Error Handler Middleware
 * Formats all application errors into structured JSON responses.
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);

  console.error(`[Error] ${err.message}`, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    request_id: req.requestId,
    ...(isProduction ? {} : { stack: err.stack }),
  });
};

/**
 * Not Found Middleware for handling unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error('Route not found');
  res.status(404);
  next(error);
};

module.exports = {
  errorHandler,
  notFoundHandler
};
