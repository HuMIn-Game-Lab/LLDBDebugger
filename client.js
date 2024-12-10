// debug-client.js
const WebSocket = require('ws');

class LLDBWebSocketClient {
    constructor(url = 'ws://localhost:8080') {
        this.url = url;
        this.ws = null;
        this.eventHandlers = new Map();
        this.responseHandlers = new Map();
        this.messageId = 1;
        this.debug = true;
        this.initialized = false;
    }

    log(message, data = null) {
        if (this.debug) {
            console.log(`[${new Date().toISOString()}] ${message}`);
            if (data) {
                console.log(JSON.stringify(data, null, 2));
            }
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.log('Attempting to connect to server...');
            
            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                this.log('WebSocket connection established');
                this.setupMessageHandler();
                resolve();
            });

            this.ws.on('error', (error) => {
                this.log('WebSocket error:', error);
                reject(error);
            });

            this.ws.on('close', (code, reason) => {
                this.log('WebSocket connection closed:', { code, reason });
            });
        });
    }

    setupMessageHandler() {
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                if (message.type === 'connectionEstablished') {
                    this.log('Connection established:', message);
                    return;
                }

                if (message.type.endsWith('Response')) {
                    this.handleCommandResponse(message);
                    return;
                }

                if (message.type.endsWith('Error')) {
                    this.handleCommandError(message);
                    return;
                }

                if (message.type.endsWith('Event')) {
                    const baseEventName = message.type.replace('Event', '');
                    this.handleEvent(baseEventName, message.data);
                    return;
                }

            } catch (error) {
                this.log('Error processing message:', error);
                console.error('Raw message:', data.toString());
            }
        });
    }

    handleEvent(eventName, data) {
        const handlers = this.eventHandlers.get(eventName) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                this.log(`Error in event handler for ${eventName}:`, error);
            }
        });
    }
   
    handleCommandResponse(message) {
        const handler = this.responseHandlers.get(message.id);
        if (handler) {
            handler.resolve(message.data);
            this.responseHandlers.delete(message.id);
    
            if (message.type === 'initializeResponse' && !this.initialized) {
                this.initialized = true;
                this.handleEvent('initialized', message.data); // Emit event after setting flag
            }
        }
    }

    handleCommandError(message) {
        const handler = this.responseHandlers.get(message.id);
        if (handler) {
            this.log(`Handling error for message ${message.id}`, message);
            handler.reject(new Error(message.message));
            this.responseHandlers.delete(message.id);
        }
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
        this.log(`Registered handler for event: ${event}`);
    }

    async sendCommand(command, params = {}) {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket is not connected'));
                return;
            }

            const id = this.messageId++;
            const message = {
                command,
                id,
                ...params
            };

            this.responseHandlers.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(message));

            setTimeout(() => {
                if (this.responseHandlers.has(id)) {
                    const error = new Error(`Command timeout: ${command}`);
                    this.responseHandlers.get(id).reject(error);
                    this.responseHandlers.delete(id);
                }
            }, 20000);
        });
    }

    async initialize(programPath) {
        this.log('Initializing LLDB with program:', programPath);
        const result = await this.sendCommand('initialize', { programPath });
        return result;
    }

    async execute(method, ...args) {
        if (!this.initialized) {
            throw new Error('Client not initialized');
        }
        return this.sendCommand('execute', { method, args });
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.log('WebSocket connection closed');
        }
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

async function setUpAndRun(client) {
    try{
        console.log('Waiting for initialization to complete...');
        while (!client.initialized) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        let file = "./tests/fixtures/test-program.cpp";
        console.log('Setting up and running tests...');

        console.log('Setting breakpoint at main');
        const breakpointNameResponse = await client.execute('setBreakpointByName', 'main');
        console.log('Breakpoint Name Response:', breakpointNameResponse);

        await client.sleep(50);

        console.log('Setting breakpoint in file');
        const breakpointFileResponse = await client.execute('setBreakpoint', file, 21);
        console.log('Breakpoint File Response:', breakpointFileResponse);

        await client.sleep(50);

        console.log('Setting breakpoint in file');
        const breakpointFileResponse2 = await client.execute('setBreakpoint', file , 25);
        console.log('Breakpoint File Response:', breakpointFileResponse2);

        await client.sleep(50);

        console.log('Setting breakpoint in file');
        const breakpointFileResponse3 = await client.execute('setBreakpoint', file, 28);
        console.log('Breakpoint File Response:', breakpointFileResponse3);

        await client.sleep(50);

        console.log('Fetching breakpoints');
        const breakpoints = await client.execute('getBreakpoints');
        console.log('Breakpoints:', breakpoints);

        await client.sleep(50);

        console.log('Starting the program');
        const runResponse = await client.execute('run');
        console.log('Run Response:', runResponse);

        isRunningTests = true;

        await client.sleep(50);
    }
    catch (error) {
        console.error('Error during setUpAndRun:', error);
    }
    
}

async function runTest(client) {
    try{
        console.log('Running tests...');

        console.log('Fetching breakpoints');
        const breakpoints = await client.execute('getBreakpoints');
        console.log('Breakpoints:', breakpoints);

        await client.sleep(50);

        console.log('Fetching all variables in current frame');
        const variables = await client.execute('getAllVariablesInCurrentFrame');
        console.log('Variables:', JSON.stringify(variables, null, 2));

        await client.sleep(50);

        console.log('Fetching specific variable (y) in current frame');
        const variableY = await client.execute('getVariableInCurrentFrame', 'y');
        console.log('Variable Y:', variableY);

        await client.sleep(50);

        console.log('Using expression to evaluate x + y');
        const expressionResponse = await client.execute('evaluateExpression', 'x + y');
        console.log('Expression Response:', expressionResponse);

        await client.sleep(50);

        console.log('List Threads');
        const threads = await client.execute('listThreads');
        console.log('Threads:', threads);

        await client.sleep(50);

        console.log('Getting current thread');
        const currentThread = await client.execute('getCurrentThread');
        console.log('Current Thread:', currentThread);

        await client.sleep(50);

        console.log('Get Backtrace');
        const backtrace = await client.execute('getThreadBacktrace', { count: 20 });
        console.log('Backtrace:', backtrace);

        await client.sleep(50);

        console.log('Read Memory');
        const memory = await client.execute('readMemory', '$rsp', { size: 8, format: 'x', count: 4 });
        console.log('Memory:', memory);

        await client.sleep(50);

        
        console.log('Continuing program execution');
        const continueResponse = await client.execute('continue');
        console.log('Continue Response:', continueResponse);

        await client.sleep(50);

        
        if(isRunningTests){
            console.log('Pausing program execution');
            const pauseResponse = await client.execute('pause');
            console.log('Pause Response:', pauseResponse);
        }
        
    }
     catch (error) {
        console.error('Error during runTest:', error);
    }

    
}
let isRunningTests = false;
async function main() {
    const client = new LLDBWebSocketClient();
    let initializedHandled = false;
    

    try {
        console.log('Connecting to LLDB WebSocket server...');
        await client.connect();

        client.on('prompt', (data) => console.log('Prompt Event:', data));
        client.on('stdout', (data) => console.log('Stdout Event:', data));
        client.on('stderr', (data) => console.log('Stderr Event:', data));
        client.on('exited', (data) => {
            isRunningTests = false;
            console.log('Exit Event:', data)
        });
        client.on('breakpoint', async (data) => {
            console.log('Breakpoint Event:', data);
            await runTest(client).catch(console.error);
        });
        client.on('paused', async (data) => {
            console.log('Paused Event:', data);
            await client.execute('continue').catch(console.error);
        });
        client.on('stopped', (data) => console.log('Stopped Event:', data));
        client.on('exited', (data) => console.log('Exited Event:', data));
        client.on('initialized', async (data) => {
            if (initializedHandled) {
                console.log('Skipping duplicate initialized event.');
                return;
            }
            initializedHandled = true;

            console.log('Initialized Event:', data);
            await new Promise(resolve => setTimeout(resolve, 100)); // Ensure server readiness
            // await setUpAndRun(client);
        });

        console.log('Initializing debugger...');
        const testProgram = './tests/fixtures/test-program';
        const initResult = await client.initialize(testProgram);
        console.log('Initialization result:', initResult);
        await setUpAndRun(client);
    } catch (error) {
        console.error('Error during debugging session:', error);
    } 
}

process.on('SIGINT', () => {
    if (isRunningTests) {
        console.log('Tests are still running. Delaying shutdown...');
        return;
    }
    console.log('Shutting down client...');
    client.close();
    process.exit(0);
});



if (require.main === module) {
    main().catch(console.error);
}

module.exports = LLDBWebSocketClient;
