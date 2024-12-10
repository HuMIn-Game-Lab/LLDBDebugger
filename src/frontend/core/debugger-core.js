// core/debugger-core.js
class DebuggerCore {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.messageId = 1;
        this.pendingCommands = new Map();
        this.eventHandlers = new Map();
        this.debug = true;
        this.initialized = false;
    }

    debugLog(message, data = null) {
        if (this.debug) {
            console.log(`[DebuggerCore] ${message}`);
            if (data) {
                console.log(JSON.stringify(data, null, 2));
            }
            this.emit('debugMessage', {
                message: message,
                data: data,
                timestamp: new Date().toISOString()
            });
        }
    }

    async connect(programPath) {
        return new Promise((resolve, reject) => {
            try {
                this.debugLog('Attempting to connect...', { programPath });
                this.ws = new WebSocket('ws://localhost:8080');
                
                this.ws.onopen = async () => {
                    this.debugLog('WebSocket connected');
                    this.connected = true;
                    this.emit('connected');
                    
                    try {
                        const initResult = await this.sendCommand('initialize', { 
                            programPath 
                        });
                        this.initialized = true;
                        this.debugLog('Initialization successful', initResult);
                        this.emit('initialized', initResult);
                        resolve(initResult);
                    } catch (error) {
                        this.debugLog('Initialization failed', error);
                        reject(error);
                    }
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.debugLog('Received message', message);
                        this.handleMessage(message);
                    } catch (error) {
                        this.debugLog('Error handling message', error);
                        this.emit('error', `Message handling error: ${error.message}`);
                    }
                };

                this.ws.onclose = () => {
                    this.debugLog('WebSocket connection closed');
                    this.connected = false;
                    this.initialized = false;
                    this.emit('disconnected');
                };

                this.ws.onerror = (error) => {
                    this.debugLog('WebSocket error occurred', error);
                    this.emit('error', `WebSocket error: ${error.message}`);
                    reject(error);
                };

            } catch (error) {
                this.debugLog('Connection attempt failed', error);
                this.emit('error', `Connection failed: ${error.message}`);
                reject(error);
            }
        });
    }

    async sendCommand(command, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                const error = new Error('Not connected to server');
                this.debugLog('Command send failed - not connected', { command, params });
                reject(error);
                return;
            }

            const id = this.messageId++;
            const message = { command, id, ...params };
            
            this.debugLog('Sending command', message);
            this.pendingCommands.set(id, { resolve, reject });
            
            // Emit outgoing message for UI
            this.emit('outgoingMessage', {
                message: message,
                timestamp: new Date().toISOString()
            });

            try {
                this.ws.send(JSON.stringify(message));
            } catch (error) {
                this.debugLog('Send failed', error);
                this.pendingCommands.delete(id);
                reject(error);
                return;
            }
            
            setTimeout(() => {
                if (this.pendingCommands.has(id)) {
                    const error = new Error(`Command timeout: ${command}`);
                    this.debugLog('Command timeout', { command, id });
                    this.pendingCommands.get(id).reject(error);
                    this.pendingCommands.delete(id);
                }
            }, 15000);
        });
    }

    async executeCommand(method, ...args) {
        if (!this.initialized) {
            throw new Error('Debugger not initialized');
        }

        this.debugLog('Executing command', { method, args });
        try {
            const response = await this.sendCommand('execute', { method, args });
            this.debugLog(`Command ${method} response received`, response);
            this.emit('commandExecuted', { method, response });
            return response;
        } catch (error) {
            this.debugLog(`Command ${method} failed`, error);
            this.emit('error', `Command ${method} failed: ${error.message}`);
            throw error;
        }
    }

    handleMessage(message) {
        this.debugLog('Processing message', message);

        if (message.type.endsWith('Response')) {
            this.handleCommandResponse(message);
        } else if (message.type.endsWith('Event')) {
            this.handleEvent(message);
        } else if (message.type.endsWith('Error')) {
            this.handleError(message);
        }
        
        // Emit raw message for logging purposes
        this.emit('rawMessage', message);
    }

    handleCommandResponse(message) {
        this.debugLog('Handling command response', message);
        const pending = this.pendingCommands.get(message.id);
        if (pending) {
            pending.resolve(message.data);
            this.pendingCommands.delete(message.id);
        }
        
        // Emit specific response event for UI updates
        this.emit('response', message);
        
        // Emit the specific response type for targeted handling
        const responseType = message.type.replace('Response', '');
        this.emit(responseType, message.data);
    }

    handleEvent(message) {
        const event = message.type.replace('Event', '');
        this.debugLog(`Handling event: ${event}`, message.data);
        this.emit(event, message.data);
    }

    handleError(message) {
        this.debugLog('Handling error', message);
        this.emit('error', message.message);
        const pending = this.pendingCommands.get(message.id);
        if (pending) {
            pending.reject(new Error(message.message));
            this.pendingCommands.delete(message.id);
        }
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (!this.eventHandlers.has(event)) {
            return;
        }
        const handlers = this.eventHandlers.get(event);
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }

    emit(event, data) {
        const handlers = this.eventHandlers.get(event) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        });
    }

    disconnect() {
        if (this.ws) {
            this.debugLog('Disconnecting');
            this.ws.close();
            this.ws = null;
            this.connected = false;
            this.initialized = false;
            this.pendingCommands.clear();
        }
    }

    isConnected() {
        return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    isInitialized() {
        return this.initialized;
    }
}

window.DebuggerCore = DebuggerCore;