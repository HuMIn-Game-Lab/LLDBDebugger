// debugger-interface.js
class DebuggerInterface {
    constructor() {
        this.core = new DebuggerCore();
        this.commands = new DebuggerCommands(this.core);
        this.ui = new DebuggerUI();
        this.initialized = false;
        this.setupEventHandlers();
        this.setupUIListeners();
    }

    setupEventHandlers() {
        // Core debugging events
        this.core.on('debugMessage', (data) => {
            this.ui.log(data.message, 'debug');
            if (data.data) {
                this.ui.displayMessage('debug', data.data);
            }
        });

        this.core.on('outgoingMessage', (data) => {
            this.ui.displayMessage('outgoing', data.message);
        });

        this.core.on('response', (message) => {
            this.ui.displayMessage('incoming', message);
        });

        // Connection events
        this.core.on('connected', () => {
            this.ui.log('Connected to debug server', 'success');
            this.ui.setConnectionStatus(true);
            this.ui.setControlsEnabled(false); // Wait for initialization
        });

        this.core.on('initialized', () => {
            this.initialized = true;
            this.ui.log('Debugger initialized successfully', 'success');
            this.ui.setControlsEnabled(true);
            this.setupInitialBreakpoints();
        });

        this.core.on('disconnected', () => {
            this.initialized = false;
            this.ui.log('Disconnected from debug server', 'error');
            this.ui.setConnectionStatus(false);
            this.ui.setControlsEnabled(false);
        });

        // Error handling
        this.core.on('error', (error) => {
            this.ui.log(error, 'error');
            this.ui.displayMessage('error', { error: error });
        });

        // Debug state events
        this.core.on('breakpoint', (data) => {
            this.ui.log('Breakpoint hit', 'info');
            this.ui.displayMessage('event', { type: 'breakpoint', data });
            this.refreshDebugState();
        });

        this.core.on('paused', (data) => {
            this.ui.log('Program paused', 'info');
            this.ui.displayMessage('event', { type: 'paused', data });
            this.refreshDebugState();
        });

        this.core.on('exited', (data) => {
            this.ui.log(`Program exited with code ${data.status}`, 'info');
            this.initialized = false;
            this.ui.setControlsEnabled(false);
        });
    }

    setupUIListeners() {
        // Connection control
        document.getElementById('connectBtn')?.addEventListener('click', () => {
            this.connect();
        });

        // Debug controls
        document.querySelectorAll('.debug-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!this.initialized) {
                    this.ui.log('Debugger not initialized', 'error');
                    return;
                }

                const command = btn.dataset.command;
                if (command && this.commands[command]) {
                    try {
                        this.ui.log(`Executing ${command}...`, 'info');
                        await this.commands[command]();
                        this.ui.log(`${command} completed`, 'success');
                    } catch (error) {
                        this.ui.log(`${command} failed: ${error.message}`, 'error');
                    }
                }
            });
        });

        // Breakpoint controls
        document.getElementById('setBreakpointBtn')?.addEventListener('click', () => {
            this.setBreakpoint();
        });

        document.getElementById('listBreakpointsBtn')?.addEventListener('click', () => {
            this.listBreakpoints();
        });

        // Variable inspection
        document.getElementById('getVariablesBtn')?.addEventListener('click', () => {
            this.getAllVariables();
        });

        // Thread controls
        document.getElementById('listThreadsBtn')?.addEventListener('click', () => {
            this.listThreads();
        });

        document.getElementById('getBacktraceBtn')?.addEventListener('click', () => {
            this.getBacktrace();
        });

        // Memory inspection
        document.getElementById('readMemoryBtn')?.addEventListener('click', () => {
            this.readMemory();
        });
    }

    async connect() {
        const programPath = document.getElementById('programPath')?.value;
        if (!programPath) {
            this.ui.log('Program path is required', 'error');
            return;
        }

        try {
            this.ui.log('Connecting to debug server...', 'info');
            await this.core.connect(programPath);
        } catch (error) {
            this.ui.log(`Connection failed: ${error.message}`, 'error');
        }
    }

    async setupInitialBreakpoints() {
        try {
            this.ui.log('Setting up initial breakpoints...', 'info');
            await this.commands.setBreakpoint('test-program.cpp', 15);
            await this.refreshBreakpoints();
        } catch (error) {
            this.ui.log(`Failed to set initial breakpoints: ${error.message}`, 'error');
        }
    }

    async setBreakpoint() {
        if (!this.initialized) {
            this.ui.log('Debugger not initialized', 'error');
            return;
        }

        const file = document.getElementById('breakpointFile')?.value;
        const line = parseInt(document.getElementById('breakpointLine')?.value);

        if (!file || isNaN(line)) {
            this.ui.log('Invalid breakpoint location', 'error');
            return;
        }

        try {
            this.ui.log(`Setting breakpoint at ${file}:${line}...`, 'info');
            await this.commands.setBreakpoint(file, line);
            await this.refreshBreakpoints();
            this.ui.log('Breakpoint set successfully', 'success');
        } catch (error) {
            this.ui.log(`Failed to set breakpoint: ${error.message}`, 'error');
        }
    }

    async readMemory() {
        if (!this.initialized) return;

        const address = document.getElementById('memoryAddress')?.value;
        const size = parseInt(document.getElementById('memorySize')?.value) || 8;
        const count = parseInt(document.getElementById('memoryCount')?.value) || 1;

        if (!address) {
            this.ui.log('Memory address is required', 'error');
            return;
        }

        try {
            const result = await this.commands.readMemory(address, { size, count, format: 'x' });
            this.ui.updateMemoryView(result.memoryData);
            this.ui.log('Memory read successful', 'success');
        } catch (error) {
            this.ui.log(`Failed to read memory: ${error.message}`, 'error');
        }
    }

    async refreshBreakpoints() {
        try {
            const breakpoints = await this.commands.getBreakpoints();
            this.ui.updateBreakpoints(breakpoints);
        } catch (error) {
            this.ui.log(`Failed to refresh breakpoints: ${error.message}`, 'error');
        }
    }

    async listBreakpoints() {
        if (!this.initialized) return;
        await this.refreshBreakpoints();
    }

    async getAllVariables() {
        if (!this.initialized) return;

        try {
            const variables = await this.commands.getAllVariables();
            this.ui.updateVariablesTable(variables);
        } catch (error) {
            this.ui.log(`Failed to get variables: ${error.message}`, 'error');
        }
    }

    async listThreads() {
        if (!this.initialized) return;

        try {
            const response = await this.commands.listThreads();
            this.ui.updateThreads(response.threads);
        } catch (error) {
            this.ui.log(`Failed to list threads: ${error.message}`, 'error');
        }
    }

    async getBacktrace() {
        if (!this.initialized) return;

        try {
            const backtrace = await this.commands.getBacktrace({ count: 20 });
            this.ui.updateStackTrace(backtrace.frames);
        } catch (error) {
            this.ui.log(`Failed to get backtrace: ${error.message}`, 'error');
        }
    }

    async inspectVariable(name) {
        if (!this.initialized) return;

        try {
            const result = await this.commands.evaluateExpression(name);
            this.ui.log(`Variable ${name}: ${JSON.stringify(result, null, 2)}`, 'info');
        } catch (error) {
            this.ui.log(`Failed to inspect variable: ${error.message}`, 'error');
        }
    }

    async removeBreakpoint(id) {
        if (!this.initialized) return;

        try {
            await this.commands.removeBreakpoint(id);
            await this.refreshBreakpoints();
            this.ui.log('Breakpoint removed successfully', 'success');
        } catch (error) {
            this.ui.log(`Failed to remove breakpoint: ${error.message}`, 'error');
        }
    }

    async refreshDebugState() {
        if (!this.initialized) return;

        try {
            this.ui.log('Refreshing debugger state...', 'info');
            
            await Promise.all([
                this.getAllVariables().catch(() => {}),
                this.listThreads().catch(() => {}),
                this.getBacktrace().catch(() => {}),
                this.refreshBreakpoints().catch(() => {})
            ]);

            this.ui.log('State refresh completed', 'success');
        } catch (error) {
            this.ui.log(`Failed to refresh state: ${error.message}`, 'error');
        }
    }
}

// Initialize the interface when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.debuggerInterface = new DebuggerInterface();
});