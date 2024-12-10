// src/server.js
const LLDBWebSocketServer = require('./src/LLDB/LLDBWebSocketServer');

const server = new LLDBWebSocketServer(8080);
server.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.stop();
    process.exit(0);
});