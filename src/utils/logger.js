// src/utils/logger.js
const winston = require('winston');
const path = require('path');

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        // Add metadata if present
        if (Object.keys(metadata).length > 0) {
            log += ` ${JSON.stringify(metadata)}`;
        }
        
        // Add stack trace for errors
        if (stack) {
            log += `\n${stack}`;
        }
        
        return log;
    })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!require('fs').existsSync(logsDir)) {
    require('fs').mkdirSync(logsDir);
}

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        
        // Error log file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: logFormat
        }),
        
        // Combined log file
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: logFormat
        })
    ]
});

// Add debug logging in development environment
if (process.env.NODE_ENV !== 'production') {
    logger.debug = function(message, metadata) {
        logger.log('debug', message, metadata);
    };
}

// Error logging helper
logger.logError = function(error, context = {}) {
    if (error instanceof Error) {
        logger.error(error.message, {
            ...context,
            stack: error.stack,
            code: error.code,
            name: error.name
        });
    } else {
        logger.error(String(error), context);
    }
};

// Performance logging helper
logger.logPerformance = function(operation, duration, metadata = {}) {
    logger.info(`Performance: ${operation} took ${duration}ms`, {
        ...metadata,
        duration,
        operation,
        timestamp: new Date().toISOString()
    });
};

module.exports = logger;