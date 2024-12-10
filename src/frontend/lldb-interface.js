// lldb-interface.js
class LLDBWebInterface {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.messageQueue = [];
        this.messageId = 1;
        this.pendingCommands = new Map();
        this.setupEventListeners();
        this.setupCommandHandlers();
    }

    setupCommandHandlers() {
        this.commandHandlers = {
            setBreakpoint: () => this.handleSetBreakpoint(),
            getBreakpoints: () => this.sendCommand('execute', { method: 'getBreakpoints' }),
            run: () => this.sendCommand('execute', { method: 'run' }),
            continue: () => this.sendCommand('execute', { method: 'continue' }),
            pause: () => this.sendCommand('execute', { method: 'pause' }),
            getVariables: () => this.sendCommand('execute', { method: 'getAllVariablesInCurrentFrame' }),
            step: () => this.sendCommand('execute', { method: 'step' }),
            stepIn: () => this.sendCommand('execute', { method: 'stepIn' }),
            stepOut: () => this.sendCommand('execute', { method: 'stepOut' })
        };
    }

    setupEventListeners() {
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        
        document.querySelectorAll('.command-item').forEach(item => {
            item.addEventListener('click', () => {
                const command = item.dataset.command;
                if (this.commandHandlers[command]) {
                    this.commandHandlers[command]().catch(error => {
                        this.log(`Command failed: ${error.message}`, 'error');
                    });
                }
            });
        });
    }

    async connect() {
        const programPath = document.getElementById('programPath').value;
        
        try {
            this.ws = new WebSocket('ws://localhost:8080');
            
            this.ws.onopen = () => {
                this.log('Connected to server', 'success');
                this.setConnectionStatus(true);
                this.sendCommand('initialize', { programPath }).catch(error => {
                    this.log(`Initialization failed: ${error.message}`, 'error');
                });
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    this.log(`Failed to parse message: ${error.message}`, 'error');
                }
            };

            this.ws.onclose = () => {
                this.log('Disconnected from server', 'error');
                this.setConnectionStatus(false);
                this.cleanup();
            };

            this.ws.onerror = (error) => {
                this.log('WebSocket error: ' + error.message, 'error');
            };
        } catch (error) {
            this.log(`Connection failed: ${error.message}`, 'error');
        }
    }

    cleanup() {
        this.connected = false;
        this.pendingCommands.clear();
        this.updateVariablesTable([]);
        this.updateBreakpointList([]);
        this.updateStackTrace([]);
    }

    async sendCommand(command, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('Not connected to server'));
                return;
            }

            const id = this.messageId++;
            const message = { command, id, ...params };

            this.pendingCommands.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(message));
            this.log(`Sent command: ${command}`, 'info');

            // Set timeout for command
            setTimeout(() => {
                if (this.pendingCommands.has(id)) {
                    const error = new Error(`Command timeout: ${command}`);
                    this.pendingCommands.get(id).reject(error);
                    this.pendingCommands.delete(id);
                }
            }, 10000);
        });
    }

    handleMessage(message) {
        this.log(`Received message type: ${message.type}`);

        if (message.type.endsWith('Response')) {
            this.handleCommandResponse(message);
        } else if (message.type.endsWith('Event')) {
            this.handleEvent(message);
        } else if (message.type.endsWith('Error')) {
            this.handleError(message);
        }
    }

    handleCommandResponse(message) {
        const command = message.type.replace('Response', '');
        this.log(`Received ${command} response`, 'success');

        // Resolve pending command
        const pending = this.pendingCommands.get(message.id);
        if (pending) {
            pending.resolve(message.data);
            this.pendingCommands.delete(message.id);
        }

        // Update UI based on response type
        switch (command) {
            case 'initialize':
                this.handleInitializeResponse(message.data);
                break;
            case 'getAllVariablesInCurrentFrame':
                this.updateVariablesTable(message.data);
                break;
            case 'getBreakpoints':
                this.updateBreakpointList(message.data);
                break;
            case 'getStackTrace':
                this.updateStackTrace(message.data);
                break;
            default:
                this.log(JSON.stringify(message.data, null, 2));
        }
    }

    handleEvent(message) {
        const event = message.type.replace('Event', '');
        
        switch (event) {
            case 'breakpoint':
                this.handleBreakpointEvent(message.data);
                break;
            case 'paused':
                this.handlePausedEvent(message.data);
                break;
            case 'continued':
                this.handleContinuedEvent(message.data);
                break;
            case 'exited':
                this.handleExitedEvent(message.data);
                break;
            default:
                this.log(`${event}: ${JSON.stringify(message.data)}`, 'info');
        }
    }

    handleError(message) {
        this.log(`Error: ${message.message}`, 'error');
        
        const pending = this.pendingCommands.get(message.id);
        if (pending) {
            pending.reject(new Error(message.message));
            this.pendingCommands.delete(message.id);
        }
    }

    handleInitializeResponse(data) {
        this.connected = true;
        this.log('Debugger initialized successfully', 'success');
        this.enableDebugControls();
    }

    handleBreakpointEvent(data) {
        this.log('Breakpoint hit', 'info');
        // Refresh state when breakpoint is hit
        this.refreshDebugState();
    }

    handlePausedEvent(data) {
        this.log('Program paused', 'info');
        this.refreshDebugState();
    }

    handleContinuedEvent(data) {
        this.log('Program continued', 'info');
    }

    handleExitedEvent(data) {
        this.log(`Program exited with code ${data.exitCode}`, 'info');
        this.cleanup();
    }

    async refreshDebugState() {
        try {
            await this.commandHandlers.getVariables();
            await this.commandHandlers.getBreakpoints();
            // Additional state refreshes can be added here
        } catch (error) {
            this.log(`Failed to refresh debug state: ${error.message}`, 'error');
        }
    }

    async handleSetBreakpoint() {
        const file = prompt('Enter file name (e.g., test-program.cpp):');
        const line = parseInt(prompt('Enter line number:'));
        if (file && !isNaN(line)) {
            try {
                await this.sendCommand('execute', {
                    method: 'setBreakpoint',
                    args: [file, line]
                });
                await this.commandHandlers.getBreakpoints();
            } catch (error) {
                this.log(`Failed to set breakpoint: ${error.message}`, 'error');
            }
        }
    }

    updateVariablesTable(variables) {
        const tbody = document.getElementById('variablesTable');
        tbody.innerHTML = '';
        
        variables.forEach(variable => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = variable.name;
            row.insertCell(1).textContent = variable.type;
            row.insertCell(2).textContent = variable.value;
        });
    }

    updateBreakpointList(breakpoints) {
        const list = document.getElementById('breakpointList');
        list.innerHTML = '';
        
        breakpoints.forEach(bp => {
            const item = document.createElement('div');
            item.className = 'breakpoint-item';
            item.innerHTML = `
                <span>${bp.file}:${bp.line}</span>
                <button class="button" onclick="lldbInterface.removeBreakpoint(${bp.id})">Remove</button>
            `;
            list.appendChild(item);
        });
    }

    updateStackTrace(frames) {
        const stackTrace = document.getElementById('stackTrace');
        stackTrace.innerHTML = frames.map(frame => 
            `<div class="stack-frame">
                ${frame.function} at ${frame.file}:${frame.line}
            </div>`
        ).join('');
    }

    log(message, level = 'info') {
        const output = document.getElementById('outputPanel');
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${message}`;
        
        const div = document.createElement('div');
        div.className = level;
        div.textContent = formattedMessage;
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    }

    setConnectionStatus(connected) {
        this.connected = connected;
        const status = document.getElementById('connectionStatus');
        status.textContent = connected ? 'Connected' : 'Disconnected';
        status.className = `status ${connected ? 'connected' : 'disconnected'}`;
        
        this.enableDebugControls();
    }

    enableDebugControls() {
        document.querySelectorAll('.command-item').forEach(item => {
            item.style.opacity = this.connected ? '1' : '0.5';
            item.style.pointerEvents = this.connected ? 'auto' : 'none';
        });
    }

    async removeBreakpoint(id) {
        try {
            await this.sendCommand('execute', {
                method: 'removeBreakpoint',
                args: [id]
            });
            await this.commandHandlers.getBreakpoints();
        } catch (error) {
            this.log(`Failed to remove breakpoint: ${error.message}`, 'error');
        }
    }
}

// Initialize the interface
const lldbInterface = new LLDBWebInterface();