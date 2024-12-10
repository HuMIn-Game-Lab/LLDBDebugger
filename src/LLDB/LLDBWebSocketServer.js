// src/LLDBWebSocketServer.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const LLDBClient = require('./LLDBClient');
const logger = require('../utils/logger');

class LLDBWebSocketServer {
    constructor(port = 8080) {
        this.port = port;
        this.clients = new Map();
        this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
        this.wss = new WebSocket.Server({ server: this.httpServer });
    }

    start() {
        // Set up WebSocket handlers
        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', this.handleServerError.bind(this));

        // Start server
        this.httpServer.listen(this.port, () => {
            logger.info(`Server running on http://localhost:${this.port}`);
        });
    }

    handleConnection(ws) {
        logger.info('New client connected');
        
        ws.isAlive = true;
        ws.lldbClient = null;

        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', (message) => this.handleMessage(ws, message));
        ws.on('close', () => this.handleClose(ws));
        ws.on('error', (error) => this.handleClientError(ws, error));

        this.sendToClient(ws, {
            type: 'connectionEstablished',
            status: 'connected',
            message: 'Connected to LLDB WebSocket Server'
        });
    }

    handleHttpRequest(req, res) {
        // Normalize the URL to prevent path traversal
        const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(__dirname, 'public', safePath === '/' ? 'index.html' : safePath);
    
        // Add a debug log to see what files are being requested
        console.log('Requested file:', filePath);
    
        // Handle API placeholder requests
        if (req.url.startsWith('/api/placeholder')) {
            res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
            res.end(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" fill="#ddd"/>
                <text x="50" y="50" font-family="Arial" font-size="14" fill="#666" 
                    text-anchor="middle" dy=".3em">Placeholder</text>
            </svg>`);
            return;
        }
    
        const extname = path.extname(filePath);
        const contentType = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml'
        }[extname] || 'text/plain';
    
        fs.readFile(filePath, (error, content) => {
            if (error) {
                console.error('File read error:', error);
                if (error.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end(`File not found: ${safePath}`);
                } else {
                    res.writeHead(500);
                    res.end(`Server error: ${error.code}`);
                }
            } else {
                res.writeHead(200, { 
                    'Content-Type': contentType,
                    // Add cache control headers
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                res.end(content, 'utf-8');
            }
        });
    }

    async handleMessage(ws, message) {
        try {
            const request = JSON.parse(message);
            logger.debug('Received message:', request);

            switch (request.command) {
                case 'initialize':
                    await this.handleInitialize(ws, request);
                    break;
                    
                case 'execute':
                    await this.handleExecute(ws, request);
                    break;

                default:
                    this.sendToClient(ws, {
                        type: 'errorResponse',
                        id: request.id,
                        message: `Unknown command: ${request.command}`
                    });
            }
        } catch (error) {
            logger.error('Error handling message:', error);
            this.sendToClient(ws, {
                type: 'errorResponse',
                id: request?.id,
                message: error.message
            });
        }
    }

    async handleInitialize(ws, request) {
        if (!request.programPath) {
            throw new Error('Program path is required');
        }

        try {
            const lldb = new LLDBClient(request.programPath);
            this.setupEventForwarding(ws, lldb);
            this.clients.set(ws, lldb);
            ws.lldbClient = lldb;

            const initResponse = await lldb.start();

            this.sendToClient(ws, {
                type: 'initializeResponse',
                id: request.id,
                data: {
                    status: 'success',
                    message: initResponse
                }
            });

        } catch (error) {
            logger.error('Initialization failed:', error);
            this.sendToClient(ws, {
                type: 'initializeError',
                id: request.id,
                message: 'Failed to initialize LLDB: ' + error.message
            });
        }
    }

    async handleExecute(ws, request) {
        const lldb = ws.lldbClient;
        if (!lldb) {
            throw new Error('LLDB not initialized');
        }

        if (!request.method || !lldb[request.method]) {
            throw new Error(`Unknown method: ${request.method}`);
        }

        try {
            const result = await lldb[request.method](...(request.args || []));
            
            this.sendToClient(ws, {
                type: `${request.method}Response`,
                id: request.id,
                data: result
            });
        } catch (error) {
            this.sendToClient(ws, {
                type: `${request.method}Error`,
                id: request.id,
                message: error.message
            });
        }
    }

    setupEventForwarding(ws, lldb) {
        const events = [
            'initialized',
            'breakpoint',
            'paused',
            'stopped',
            'exited',
            'prompt',
            'programOutput'
        ];

        events.forEach(event => {
            lldb.on(event, (data) => {
                this.sendToClient(ws, {
                    type: `${event}Event`,
                    data: data
                });
            });
        });
    }

    sendToClient(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    handleClose(ws) {
        logger.info('Client disconnected');
        const lldb = this.clients.get(ws);
        if (lldb) {
            lldb.terminate();
            this.clients.delete(ws);
        }
    }

    handleClientError(ws, error) {
        logger.error('Client error:', error);
        this.handleClose(ws);
    }

    handleServerError(error) {
        logger.error('Server error:', error);
    }

    stop() {
        if (this.wss) {
            this.wss.clients.forEach(client => {
                const lldb = this.clients.get(client);
                if (lldb) {
                    lldb.terminate();
                }
                client.terminate();
            });

            this.wss.close(() => {
                logger.info('WebSocket server stopped');
            });
        }
    }
}

module.exports = LLDBWebSocketServer;


// // src/server/LLDBWebSocketServer.js
// const WebSocket = require('ws');
// const http = require('http');
// const fs = require('fs');
// const path = require('path');
// const LLDBClient = require('./LLDBClient');
// const logger = require('./utils/logger');

// class LLDBWebSocketServer {

//     constructor(port = 8080) {
//         this.port = port;
//         this.clients = new Map();
        
//         // Create HTTP server
//         this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
        
//         // Create WebSocket server attached to HTTP server
//         this.wss = new WebSocket.Server({ server: this.httpServer });
//     }

//     start() {
//         // Set up WebSocket handlers
//         this.wss.on('connection', this.handleWsConnection.bind(this));
//         this.wss.on('error', this.handleServerError.bind(this));

//         // Start server
//         this.httpServer.listen(this.port, () => {
//             logger.info(`Server running on http://localhost:${this.port}`);
//         });
//     }

//     handleHttpRequest(req, res) {
//         let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
        
//         // Handle API placeholder requests
//         if (req.url.startsWith('/api/placeholder')) {
//             res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
//             res.end(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
//                 <rect width="100" height="100" fill="#ddd"/>
//                 <text x="50" y="50" font-family="Arial" font-size="14" fill="#666" 
//                     text-anchor="middle" dy=".3em">Placeholder</text>
//             </svg>`);
//             return;
//         }

//         const extname = path.extname(filePath);
//         const contentType = {
//             '.html': 'text/html',
//             '.js': 'text/javascript',
//             '.css': 'text/css',
//             '.svg': 'image/svg+xml'
//         }[extname] || 'text/plain';

//         fs.readFile(filePath, (error, content) => {
//             if (error) {
//                 if (error.code === 'ENOENT') {
//                     res.writeHead(404);
//                     res.end('File not found');
//                 } else {
//                     res.writeHead(500);
//                     res.end('Server error');
//                 }
//             } else {
//                 res.writeHead(200, { 'Content-Type': contentType });
//                 res.end(content, 'utf-8');
//             }
//         });
//     }

//     // constructor(port = 8080) {
//     //     this.port = port;
//     //     this.wss = null;
//     //     this.clients = new Map();
//     // }

//     // start() {
//     //     this.wss = new WebSocket.Server({ port: this.port });
//     //     logger.info(`WebSocket server started on port ${this.port}`);

//     //     this.wss.on('connection', this.handleConnection.bind(this));
//     //     this.wss.on('error', this.handleServerError.bind(this));
//     // }

//     handleConnection(ws) {
//         logger.info('New client connected');
        
//         ws.isAlive = true;
//         ws.lldbClient = null;

//         ws.on('pong', () => { ws.isAlive = true; });
//         ws.on('message', (message) => this.handleMessage(ws, message));
//         ws.on('close', () => this.handleClose(ws));
//         ws.on('error', (error) => this.handleClientError(ws, error));

//         this.sendToClient(ws, {
//             type: 'connectionEstablished',
//             status: 'connected',
//             message: 'Connected to LLDB WebSocket Server'
//         });
//     }

//     async handleMessage(ws, message) {
//         try {
//             const request = JSON.parse(message);
//             logger.debug('Received message:', request);

//             switch (request.command) {
//                 case 'initialize':
//                     await this.handleInitialize(ws, request);
//                     break;
                    
//                 case 'execute':
//                     await this.handleExecute(ws, request);
//                     break;

//                 default:
//                     this.sendToClient(ws, {
//                         type: 'errorResponse',
//                         id: request.id,
//                         message: `Unknown command: ${request.command}`
//                     });
//             }
//         } catch (error) {
//             logger.error('Error handling message:', error);
//             this.sendToClient(ws, {
//                 type: 'errorResponse',
//                 id: request?.id,
//                 message: error.message
//             });
//         }
//     }

//     async handleExecute(ws, request) {
//         const lldb = ws.lldbClient;
//         if (!lldb) {
//             throw new Error('LLDB not initialized');
//         }

//         if (!request.method || !lldb[request.method]) {
//             throw new Error(`Unknown method: ${request.method}`);
//         }

//         try {
//             const result = await lldb[request.method](...(request.args || []));
            
//             // Create a response type based on the method name
//             const responseType = `${request.method}Response`;
            
//             this.sendToClient(ws, {
//                 type: responseType,
//                 id: request.id,
//                 data: result
//             });
//         } catch (error) {
//             this.sendToClient(ws, {
//                 type: `${request.method}Error`,
//                 id: request.id,
//                 message: error.message
//             });
//         }
//     }

//     async handleInitialize(ws, request) {
//         if (!request.programPath) {
//             throw new Error('Program path is required');
//         }

//         try {
//             const lldb = new LLDBClient(request.programPath);
//             this.setupEventForwarding(ws, lldb);
//             this.clients.set(ws, lldb);
//             ws.lldbClient = lldb;

//             const initResponse = await lldb.start();

//             this.sendToClient(ws, {
//                 type: 'initializeResponse',
//                 id: request.id,
//                 data: {
//                     status: 'success',
//                     message: initResponse
//                 }
//             });

//         } catch (error) {
//             logger.error('Initialization failed:', error);
//             this.sendToClient(ws, {
//                 type: 'initializeError',
//                 id: request.id,
//                 message: 'Failed to initialize LLDB: ' + error.message
//             });
//         }
//     }

//     setupEventForwarding(ws, lldb) {
//         const events = [
//             'initialized',
//             'breakpoint',
//             'paused',
//             'stopped',
//             'exited',
//             'prompt',
//             'programOutput'
//         ];

//         events.forEach(event => {
//             lldb.on(event, (data) => {
//                 this.sendToClient(ws, {
//                     type: `${event}Event`,
//                     data: data
//                 });
//             });
//         });
//     }

//     sendToClient(ws, data) {
//         if (ws.readyState === WebSocket.OPEN) {
//             ws.send(JSON.stringify(data));
//         }
//     }

//     handleClose(ws) {
//         logger.info('Client disconnected');
//         const lldb = this.clients.get(ws);
//         if (lldb) {
//             lldb.terminate();
//             this.clients.delete(ws);
//         }
//     }

//     handleClientError(ws, error) {
//         logger.error('Client error:', error);
//         this.handleClose(ws);
//     }

//     handleServerError(error) {
//         logger.error('Server error:', error);
//     }

//     stop() {
//         if (this.wss) {
//             this.wss.clients.forEach(client => {
//                 const lldb = this.clients.get(client);
//                 if (lldb) {
//                     lldb.terminate();
//                 }
//                 client.terminate();
//             });

//             this.wss.close(() => {
//                 logger.info('WebSocket server stopped');
//             });
//         }
//     }
// }

// module.exports = LLDBWebSocketServer;