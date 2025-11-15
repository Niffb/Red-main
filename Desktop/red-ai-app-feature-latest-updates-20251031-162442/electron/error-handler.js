// Error Handler Module
// Provides standardized error handling across the application

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, code = 'APP_ERROR', statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for invalid inputs
 */
class ValidationError extends AppError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR', 400, true);
  }
}

/**
 * Authentication error for failed auth attempts
 */
class AuthenticationError extends AppError {
  constructor(message) {
    super(message, 'AUTH_ERROR', 401, true);
  }
}

/**
 * Database error for MongoDB operations
 */
class DatabaseError extends AppError {
  constructor(message, originalError) {
    super(message, 'DATABASE_ERROR', 500, true);
    this.originalError = originalError;
  }
}

/**
 * Handle and format errors for user display
 * @param {Error} error - The error to handle
 * @param {string} context - Context where error occurred
 * @returns {object} Formatted error response
 */
function handleError(error, context = '') {
  const timestamp = new Date().toISOString();
  
  console.error(`[${timestamp}] Error in ${context}:`, {
    message: error.message,
    code: error.code || 'UNKNOWN',
    stack: error.stack
  });

  // Return user-friendly error for operational errors
  if (error.isOperational) {
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }

  // Hide internal errors from users
  return {
    success: false,
    error: 'An unexpected error occurred. Please try again.',
    code: 'INTERNAL_ERROR'
  };
}

/**
 * Wrap async functions with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context identifier
 * @returns {Function} Wrapped function
 */
function wrapAsync(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleError(error, context);
    }
  };
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  DatabaseError,
  handleError,
  wrapAsync
};

