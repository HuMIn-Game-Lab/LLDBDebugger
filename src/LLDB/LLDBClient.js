// Updated LLDBClient.js
const ProcessManager = require('./ProcessManager');

class LLDBClient extends ProcessManager {
    constructor(programPath) {
        super('lldb', [programPath]);
        this.on('stdout', this.parseOutput.bind(this));
        this.outputQueue = [];
        this.processId = null;
        this.buffer = ''; // Buffer for accumulating data
        this.timer = null; // Timer for delayed processing
        this.processingDelay = 1; // Delay in milliseconds
        this.regexMap = {
            // Matches the initialization message indicating the current executable
            init: /^Current executable set to '.*?' \(\w+\)\./,
        
            // Matches breakpoint-related output
            breakpoint: /^Process \d+ stopped.*stop reason = breakpoint.*^\s*->/ms,
        
            // Matches signal-related output (e.g., SIGINT)
            signal: /^Process \d+ stopped\n\* thread #\d+.*?stop reason = signal SIGINT/m,
        
            // Matches thread list output
            threadList: /^\s*Process.*\s*\n^\s*\*.*tid = 0x[0-9a-fA-F]+.*\s*$/m,
        
            // Matches thread backtrace output
            threadBacktrace:  /^\s*\*.*\b(thread|frame)\b.*$/m,
            
            //Matches thread select
            threadSelect: /^\* thread #(\d+), queue = '(.*?)', stop reason = (.*?)\n\s+frame #0: (.*?) at (.*?):(\d+):(\d+)$/,
            
            // Matches process exit messages
            exited: /^Process (\d+) exited with status = (\d+) \(0x[0-9a-fA-F]+\)$/,
        
            // Matches the LLDB prompt
            prompt: /^\(lldb\)/,

            // Matches the run command output
            run: /^Process (\d+) launched: '(.*?)' \((\w+)\)$/,

            //Matched the continue command output
            continue: /^\s*Process (\d+) resuming\s*$/m,

            //Matches set breakpoint output
            setBreakpoint: /^Breakpoint (\d+): where = (.+?) at (.+?):(\d+)(?::(\d+))?, address = (0x[0-9a-fA-F]+)$/,

            //Matches the list breakpoints output
            listBreakpoints: /^\s*Current breakpoints:\s*\n([\s\S]*)/m,

            //Matches the expression output
            expression: /\$\d+\s*=/g,

            //Matches the variables output
            variables: /\(([^)]+)\)\s+(\w+)\s*=\s*([^\n]+)/g,

            //Matches single variable output
            variable: /^\(([^)]+)\)\s+(\w+)\s*=\s*(.+)$/,

            //Matches memory read output
            memoryRead: /^\s*0x[0-9a-fA-F]+:\s.+$/gm,
            
            //Raw Command Universal match
            rawCommand: /^(?!\(lldb\)|\s*$).+/s

        };
    }

    async sendCommandAsync(command, commandType) {
        return new Promise((resolve, reject) => {
            const callback = (data) => {
                resolve(data.trim());
            };
    
            // Save the commandType and callback to the queue
            this.outputQueue.push({ commandType, callback });
            this.sendCommand(command);
        });
    }
    parseOutput(data) {
        this.buffer += data; // Append new data to the buffer
    
        // Reset the processing timer
        if (this.timer) {
            clearTimeout(this.timer);
        }
    
        // Delay processing
        this.timer = setTimeout(() => {
            this.processBufferedOutput();
        }, this.processingDelay);
    }
    processIndvidualMessage(input) {
        // this.processInput(inputToBeProcessed.trim());
        const trimmedData = input.trim();
        // console.log('Raw Output:', trimmedData); // Debugging output for raw data
    
        // console.log("Q", this.outputQueue)
        // console.log("RegexMap", this.regexMap);
        // Process output queue if there is a command waiting
        if (this.outputQueue.length > 0) {
            const { commandType, callback } = this.outputQueue[0]; // Peek at the first callback in the queue
            // console.log(this.outputQueue[0]);
            // console.log('Command Type:', commandType);
            // console.log('Callback:', callback);
            // console.log(this.regexMap[commandType]);
            // console.log(this.regexMap[commandType].test(trimmedData));
            // console.log([...data].map(c => c.charCodeAt(0)));

            if (this.regexMap[commandType] && this.regexMap[commandType].test(trimmedData)) {
                // If regex matches and commandType is correct, process the callback
                this.outputQueue.shift(); // Remove the callback from the queue
                callback(trimmedData);
                return;
            }
        }
        
        // console.log('No matching command found');
        // console.log("Breakpoint:", this.regexMap.breakpoint.test(trimmedData));
        // console.log("Pause:", this.regexMap.signal.test(trimmedData));
        // console.log("Exited:", this.regexMap.exited.test(trimmedData));
        // console.log("Prompt:", this.regexMap.prompt.test(trimmedData));
        // Handle event-based messages
        if (this.regexMap.breakpoint.test(trimmedData)) {
            this.processBreakpointOutput(trimmedData);
        } else if (this.regexMap.signal.test(trimmedData)) {
            this.processPauseOutput(trimmedData);
        } else if (this.regexMap.exited.test(trimmedData)) {
            this.processExitOutput(trimmedData);
        } else if (this.regexMap.prompt.test(trimmedData)) {
            // Handle LLDB prompt
            this.emit('prompt', trimmedData);
        } else {
            // Unmatched data is emitted as program output
            this.emit('programOutput', trimmedData);
        }
    }
    processBufferedOutput() {
        // console.log('Processing buffered output');
        // console.log('Buffer:', this.buffer);
        // Step 1: Save, trim, and reset buffer
        const trimmedBuffer = this.buffer.trim();
        this.buffer = ''; // Clear the buffer
        this.timer = null; // Clear the timer
    
        // Step 2: Split buffer into lines
        const lines = trimmedBuffer.split('\n');
    
        let inputToBeProcessed = ''; // Accumulated input to be processed
        let nextLine = ''; // Next line to be processed
        let readyToProcess = false; // Processing flag
        let doneWithBuffer = false; // Flag to indicate buffer processing is complete
    
        // Step 3: Loop through lines while conditions hold
        while (!doneWithBuffer) {
            // console.log('Processing line:', lines[0]);
            // console.log('Accumulated input:', inputToBeProcessed);
            if(lines.length === 0) {    // If there are no more lines to process, break
                readyToProcess = true;
                doneWithBuffer = true;
                // console.log('No more lines to process');
            }else{
                nextLine = lines[0].trim(); // Peek at the next line without removing
                // console.log('Next Line:', nextLine);
            }
            
            if (!readyToProcess && this.regexMap['prompt'].test(nextLine) && inputToBeProcessed === '' ) {
                // Case 1: Line is a prompt, no accumulated input, and not ready to process
                readyToProcess = true;
                inputToBeProcessed = lines.shift(); // Remove and save the prompt line
                // console.log('Prompt:', inputToBeProcessed);
            } else if (!readyToProcess && !this.regexMap['prompt'].test(nextLine)) {
                // Case 2: Line is not a prompt, accumulate into input
                inputToBeProcessed += lines.shift() + '\n';
                // console.log('else if input:', inputToBeProcessed);
                // console.log('Ready?', readyToProcess);
            } else if(!readyToProcess){
                // Case 3: Line is a prompt, but there's already accumulated input
                readyToProcess = true;
                // console.log('else input:', inputToBeProcessed);
            }
    
            if (readyToProcess) {
                // Step 4: Reset processing flag
                inputToBeProcessed = inputToBeProcessed.trimStart();
                readyToProcess = false;
    
                // Process the accumulated input
                this.processIndvidualMessage(inputToBeProcessed);
                inputToBeProcessed = ''; // Clear accumulated input
            }

            // console.log('End of loop');
            // console.log('Ready?: ', readyToProcess );
            // console.log('Empty?: ', !lines.length > 0);
        }
    
    }

    //
    //  INITIALIZATION
    //

    async start() {
        return new Promise((resolve, reject) => {
            // Queue the initialization callback
            const callback = (data) => {
                // console.log('init callback:', data);
                if (this.regexMap['init'] && this.regexMap['init'].test(data)) {
                    this.emit('initialized', data);
                    resolve(data.trim()); // Resolve when the 'target create' output is received
                } else {
                    reject(new Error('Unexpected output during initialization'));
                }
            };
            const commandType = 'init';
            this.outputQueue.push({ commandType, callback });
            super.spawn(); // Call the original spawn method
        });
    }

    processExitOutput(data) {
        // console.log('exit callback:', data);
        const regex = /Process (\d+) exited with status = (\d+)/;
        const match = data.match(regex);

        if (match) {
            // Extract and return the process ID and status
            const processId = parseInt(match[1], 10);
            const status = parseInt(match[2], 10);
            const rawMessage = data;
            const output =  { processId, status, rawMessage };
            this.emit('exited', output);
            
        } else {
            // If the message doesn't match, return null for debugging
            const output =   { processId: null, status: null, rawMessage: data };
            this.emit('exited', output);
        }

        
        
    }

    //
    //  FLOW CONTROL
    //
    async run() {
        const output = await this.sendCommandAsync('run', 'run');
        // console.log('run callback:', output);
        // Regex to parse the process ID and program path
        const runRegex = /Process (\d+) launched: '(.*?)'/;
        const match = output.match(runRegex);
    
        if (match) {
            const processId = parseInt(match[1], 10); // Extract process ID
            this.processId = processId;
            const programPath = match[2]; // Extract program path
            return { processId, programPath };
        }
    
        // If parsing fails, return the raw output for debugging
        return { rawOutput: output };
    }
    
    async continue() {
        const output = await this.sendCommandAsync('process continue', 'continue');
        // console.log('continue callback:', output);
        return output;
    }

    async pause() {
        if (!this.processId) {
            throw new Error('No process ID available. Ensure the program is running.');
        }
    
        // console.log('Pausing program execution');
        let output = null;
        // Send SIGINT to the process
        try{
            output = await new Promise((resolve, reject) => {
                const { exec } = require('child_process');
            
                // Attempt to send SIGINT signal
                exec(`kill -SIGINT ${this.processId}`, (error, stdout, stderr) => {
                    if (error) {
                        // console.error(`SIGINT failed for process ${this.processId}: ${error.message}`);
                        
                        // Retry with numeric signal (-2)
                        exec(`kill -2 ${this.processId}`, (retryError) => {
                            if (retryError) {
                                // console.error(`Retry with SIGINT (-2) failed for process ${this.processId}: ${retryError.message}`);
                                // Reject with a meaningful error
                                return reject(`Failed to pause the process ${this.processId}`);
                            }
            
                            // console.log(`Successfully paused process ${this.processId} with SIGINT (-2)`);
                            resolve(this.processId); // Resolve with the process ID if retry is successful
                        });
                        
                    } else {
                        // console.log(`Successfully paused process ${this.processId} with SIGINT`);
                        resolve(this.processId); // Resolve with the process ID
                    }
                    
                });
                reject('Failed to pause the process');
            });
        }
        catch(error){
            // console.log('Unable to pause process', error);
        }
        
        
        return output;
    }

    processPauseOutput(data) {
        // console.log('****Pause Output:');
        // console.log(data);
        // console.log('pause callback:', data);
        // Parse the output
        const processRegex = /Process (\d+) stopped/;
        const threadRegex = /\* thread #(\d+), queue = '(.*?)', stop reason = (.*?)\n/;
        const frameRegex = /frame #0: (.*?)\n/;
        
        if (processRegex.test(data) && threadRegex.test(data) && frameRegex.test(data)) {
            const processMatch = data.match(processRegex);
            const threadMatch = data.match(threadRegex);
            const frameMatch = data.match(frameRegex);
        
            // Return structured data
            const pauseData = {
                processId: processMatch ? parseInt(processMatch[1], 10) : null,
                thread: threadMatch ? parseInt(threadMatch[1], 10) : null,
                queue: threadMatch ? threadMatch[2] : null,
                stopReason: threadMatch ? threadMatch[3] : null,
                frame: frameMatch ? frameMatch[1].trim() : null,
                rawOutput: data, // Include raw output for debugging purposes
            };

            this.emit('paused', pauseData);
        } else {
            // If the data doesn't match, emit raw data for debugging
            this.emit('paused', { rawOutput: data });
        }
    }

    async stop() {
        this.terminate();
    }

    //
    //  make these work with new async command regex
    //

    // async step() {
    //     const output = await this.sendCommandAsync('process continue --step', 'step');
    //     return output;
    // }

    // async next() {
    //     const output = await this.sendCommandAsync('process continue --step-out', 'next');
    //     return output;
    // }

    async quit() {
        const output = await this.sendCommandAsync('quit', 'quit');
        return output;  
    }

    async exit() {
        const output = await this.sendCommandAsync('exit', 'exited');
        return output;
    }

    // async continueUntil(target) {
    //     const output = await this.sendCommandAsync(`process continue --until ${target}`);
    //     return output;
    // }

    // async continueTo(target) {
    //     const output = await this.sendCommandAsync(`process continue --to ${target}`);
    //     return output;
    // }

    // async stepIn() {
    //     const output = await this.sendCommandAsync('process continue --step-in');
    //     return output;
    // }

    // async stepOut() {
    //     const output = await this.sendCommandAsync('process continue --step-out');
    //     return output;
    // }

    // async stepOver() {
    //     const output = await this.sendCommandAsync('process continue --step-over');
    //     return output;
    // }

    // async stepInstruction() {
    //     const output = await this.sendCommandAsync('process continue --step-inst');
    //     return output;
    // }
    // async stepInstructionOver() {
    //     const output = await this.sendCommandAsync('process continue --step-inst-over');
    //     return output;
    // }

    // async stepInstructionOut() {
    //     const output = await this.sendCommandAsync('process continue --step-inst-out'); 
    //     return output;
    // }

    // async stepInstructionIn() {
    //     const output = await this.sendCommandAsync('process continue --step-inst-in');
    //     return output;
    // }

    // async stepInstructionWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step-inst --count ${count}`);
    //     return output;
    // }

    // async stepInstructionOverWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step-inst-over --count ${count}`);
    //     return output;
    // }

    // async stepInstructionOutWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step-inst-out --count ${count}`);
    //     return output;
    // }

    // async stepInstructionInWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step-inst-in --count ${count}`);
    //     return output;
    // }

    // async stepWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step --count ${count}`);
    //     return output;
    // }

    // async stepOverWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step-over --count ${count}`);
    //     return output;
    // }

    // async stepOutWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step-out --count ${count}`);
    //     return output;
    // }
    
    // async stepInWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --step-in --count ${count}`);
    //     return output;
    // }

    // async continueWithCount(count) {
    //     const output = await this.sendCommandAsync(`process continue --count ${count}`);
    //     return output;
    // }

    // async continueWithExpression(expression) {
    //     const output = await this.sendCommandAsync(`process continue --expr ${expression}`);
    //     return output;
    // }

    

    //
    //  BREAKPOINTS
    //
    async setBreakpoint(file, line) {
        const output = await this.sendCommandAsync(`breakpoint set --file ${file} --line ${line}`, 'setBreakpoint');
        // console.log('setBreakpoint callback:', output);
        return output;
    }

    async setBreakpointByName(name) {
        // await this.sendCommandAsync(`breakpoint set --name ${name}`);
        const output = await this.sendCommandAsync(`breakpoint set --name ${name}`, 'setBreakpoint');
        // console.log('setBreakpointName callback:', output);
        return output;

    }

    async getBreakpoints() {
        const output = await this.sendCommandAsync('breakpoint list', 'listBreakpoints');
        // console.log('getBreakpoints callback:', output);
    
        const breakpoints = [];
        const lines = output.split('\n');
    
        const breakpointRegex = /^(\d+):(?: name = '(.*?)',)?(?: file = '(.*?)', line = (\d+),.*?| locations = (\d+))/;
        const subBreakpointRegex = /^\s+(\d+\.\d+): where = .*? at (.*?):(\d+):(\d+), address = .*?\[0x([0-9a-fA-F]+)\], (resolved|unresolved), hit count = (\d+)/;
    
        let currentBreakpoint = null;
    
        for (const line of lines) {
            const mainMatch = line.match(breakpointRegex);
            if (mainMatch) {
                if (currentBreakpoint) {
                    breakpoints.push(currentBreakpoint);
                }
                const [_, id, name, file, lineNumber, locations] = mainMatch;
                currentBreakpoint = {
                    id: parseInt(id, 10),
                    name: name || null,
                    file: file || null,
                    line: lineNumber ? parseInt(lineNumber, 10) : null,
                    locations: locations ? parseInt(locations, 10) : null,
                    details: [],
                };
            } else if (currentBreakpoint) {
                const subMatch = line.match(subBreakpointRegex);
                if (subMatch) {
                    const [__, subId, file, line, column, address, resolved, hitCount] = subMatch;
                    currentBreakpoint.details.push({
                        subId,
                        file,
                        line: parseInt(line, 10),
                        column: parseInt(column, 10),
                        address,
                        resolved: resolved === 'resolved',
                        hitCount: parseInt(hitCount, 10),
                    });
                }
            }
        }
    
        if (currentBreakpoint) {
            breakpoints.push(currentBreakpoint);
        }
    
        return breakpoints;
    }
    
    

    processBreakpointOutput(data) {
        // console.log('breakpoint event callback:', data);
        const breakpointRegex = /Process (\d+) stopped.*?thread #(\d+), queue = '(.*?)', stop reason = (.*?)\n\s*frame #(\d+): (.*?) at (.*?):(\d+):(\d+)/s;
    
        if (breakpointRegex.test(data)) {
            const match = data.match(breakpointRegex);
    
            const processId = match[1];
            const threadId = match[2];
            const queue = match[3];
            const stopReason = match[4];
            const frameNumber = match[5];
            const functionDetails = match[6];
            const file = match[7];
            const lineNumber = parseInt(match[8], 10);
            const columnNumber = parseInt(match[9], 10);
    
            // Extract source snippet
            const sourceSnippetRegex = /^(\s*\d+\s+.*)+$/m;
            const sourceMatch = data.match(sourceSnippetRegex);
            const sourceSnippet = sourceMatch ? sourceMatch[0].trim().split('\n') : [];
    
            // Emit a structured object
            const breakpointData = {
                processId,
                threadId,
                queue,
                stopReason,
                frame: {
                    number: frameNumber,
                    functionDetails,
                    file,
                    line: lineNumber,
                    column: columnNumber,
                },
                sourceSnippet,
                raw: data,
            };
    
            this.emit('breakpoint', breakpointData);
        } else {
            // If the data doesn't match, emit raw data for debugging
            this.emit('breakpoint', { rawOutput: data });
        }
    }

    //
    //  VARIABLES
    //

    async getAllVariablesInCurrentFrame() {
        const output = await this.sendCommandAsync('frame variable', 'variables');
        // console.log('getAllVars callback:', output);
        const variables = [];
        const lines = output.split('\n');

        const variableRegex = /\((.*?)\)\s+(\w+)\s*=\s*(.*)/;

        for (const line of lines) {
            const match = line.match(variableRegex);
            if (match) {
                const [_, type, name, value] = match;
                variables.push({ type: type, name: name, value: value });
            }
        }

        return variables;
    }

    async getVariableInCurrentFrame(targetName) {
        const output = await this.sendCommandAsync(`frame variable ${targetName}`, 'variable');
        // console.log('getVar callback:', output);
        const variables = [];
        const lines = output.split('\n');

        const variableRegex = /\((.*?)\)\s+(\w+)\s*=\s*(.*)/;

        for (const line of lines) {
            const match = line.match(variableRegex);
            if (match && match[2] === targetName) {
                variables.push({ type: match[1], name: match[2], value: match[3] });
            }
        }

        return variables;
    }

    //
    //  EXPRESSIONS
    //

    async evaluateExpression(expression, options = {}) {
        // Build the command with options
        const language = options.language ? `-l ${options.language}` : '-l c++';
        const objectDescription = options.objectDescription ? '-O' : '';
        const showTypes = options.showTypes ? '-T' : '';
        const command = `expression ${language} ${objectDescription} ${showTypes} -- ${expression}`;
    
        // Send the command and wait for the output
        const output = await this.sendCommandAsync(command, 'expression');
        // console.log('Expression callback:', output);
        // Parse the output for meaningful results
        const expressionRegex = /(?:\(.*?\)\s*)?(.*?)\s*=\s*(.*)/;
        const match = output.match(expressionRegex);
    
        if (match) {
            // Extract the variable name and value
            const variableName = match[1].trim();
            const variableValue = match[2].trim();
            return { variableName, variableValue, rawOutput: output };
        }
    
        // If parsing fails, return the raw output for debugging
        return { rawOutput: output };
    }
    
    //
    //  THREADS
    //
    async listThreads() {
        const output = await this.sendCommandAsync('thread list', 'threadList');
    
        // Initialize results
        const threads = [];
    
        // Regex for capturing thread details
        const threadRegex = /^\*?\s+thread #(\d+): tid = (0x[0-9a-f]+), (0x[0-9a-fA-F]+) (.*?) at (.*?):(\d+):(\d+), queue = '(.*?)', stop reason = (.*?)$/gm;
    
        let match;
        while ((match = threadRegex.exec(output)) !== null) {
            threads.push({
                threadId: parseInt(match[1], 10),
                tid: match[2],
                address: match[3],
                function: match[4].trim(),
                file: match[5].trim(),
                line: parseInt(match[6], 10),
                column: parseInt(match[7], 10),
                queue: match[8],
                stopReason: match[9].trim(),
            });
        }
    
        return { threads, rawOutput: output };
    }
    

    async selectThread(threadId) {
        if (!threadId) {
            throw new Error('A valid thread ID is required to select a thread.');
        }
    
        const output = await this.sendCommandAsync(`thread select ${threadId}`, 'threadSelect');
        // console.log('selectThread callback:', output);
        // Check if the thread selection was successful
        const successRegex = new RegExp(`thread #${threadId} selected`);
        const isSuccess = successRegex.test(output);
    
        return { success: isSuccess, rawOutput: output };
    }

    async getThreadBacktrace(options = {}) {
        const count = options.count ? `--count ${options.count}` : '';
        const output = await this.sendCommandAsync(`thread backtrace ${count}`, 'threadBacktrace');
        // console.log('getThreadBacktrace callback:', output);
        // Initialize the results
        const backtrace = {
            threadInfo: {},
            frames: [],
            rawOutput: output,
        };
    
        // Regex for the thread header
        const threadHeaderRegex = /^\* thread #(\d+), queue = '(.*?)', stop reason = (.*?)$/m;
    
        // Regex for individual frames
        const frameRegex = /^\s*(?:\* )?frame #(\d+): (.*?)$/gm;
    
        // Extract thread information
        const threadMatch = threadHeaderRegex.exec(output);
        if (threadMatch) {
            backtrace.threadInfo = {
                threadId: parseInt(threadMatch[1], 10),
                queue: threadMatch[2],
                stopReason: threadMatch[3].trim(),
            };
        }
    
        // Extract frame details
        let match;
        while ((match = frameRegex.exec(output)) !== null) {
            backtrace.frames.push({
                frameId: parseInt(match[1], 10),
                details: match[2].trim(),
            });
        }
    
        return backtrace;
    }    

    async getCurrentThread() {
        const output = await this.sendCommandAsync('thread list', 'threadList');
        // console.log('getCurrentThread callback:', output);
        // Parse the thread list output to find the currently selected thread
        const currentThreadRegex = /^\*\s+thread #(\d+): (.*?)$/m;
        const match = output.match(currentThreadRegex);
    
        if (match) {
            return {
                threadId: parseInt(match[1], 10),
                details: match[2].trim(),
                rawOutput: output, // Include raw output for debugging
            };
        }
    
        // If no current thread is found, return raw output for debugging
        return { threadId: null, details: null, rawOutput: output };
    }
    
    //
    //  MEMORY
    //
    async readMemory(address, options = {}) {
        // Build the command with options
        const size = options.size ? `-s${options.size}` : '';
        const format = options.format ? `-f${options.format}` : '';
        const count = options.count ? `-c${options.count}` : '';
        const command = `memory read ${size} ${format} ${count} ${address}`;
        // console.log('Memory Command:', command);
        // Send the command and await the response
        const output = await this.sendCommandAsync(command, 'memoryRead');
        // console.log('Memory callback:', output);
        // Parse the output and return the result
        const memoryData = [];
        const lines = output.split('\n');
    

        for (const line of lines) {
            const trimmedLine = line.trim();
        
            // Regex to match memory lines
            const match = /^\s*([0-9a-fA-Fx]+):\s+(.+)$/.exec(trimmedLine); // Ensure `x` in addresses is handled
            if (match) {
                const address = match[1]; // Extract address (before colon)
                const value = match[2].trim(); // Extract value (after colon)
        
                memoryData.push({ address, value }); // Add to results
            }
        }
    
        return {
            rawOutput: output,
            memoryData,
        };
    }

    
    //
    //  RAW COMMANDS
    //
    async sendRawCommand(command) {
        if (typeof command !== 'string' || !command.trim()) {
            throw new Error('Invalid command. Command must be a non-empty string.');
        }
    
        try {
            // Send the raw command using the existing sendCommandAsync method
            const output = await this.sendCommandAsync(command, 'rawCommand');
            return output; // Return the raw response from LLDB
        } catch (error) {
            console.error('Error executing raw command:', error);
            throw error; // Propagate the error for the caller to handle
        }
    }
    
    
    
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    
}

module.exports = LLDBClient;
