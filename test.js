// Updated test.js
const LLDBClient = require('./src/LLDB/LLDBClient');
const readline = require('readline');

const programPath = '/Users/coreyclark/Sites/Git/Classes/Projects/DAPTest/tests/fixtures/test-program';
const sourcePath = './tests/fixtures/test-program.cpp';
const lldb = new LLDBClient(programPath);
let isRunning = false;

lldb.on('prompt', () => {
    // console.log('LLDB is ready for input');
});

lldb.on('stdout', (data) => {
    if (data.includes('(lldb)')) {
        //These are the user/program prompts being sent to the console
        //Ignore these
    }
    else{
        // console.log('LLDB output:', data);
    }
    
});

lldb.on('stderr', (data) => {
    console.error('LLDB error:', data);
});

lldb.on('exited', (code, signal) => {
    isRunning = false;
    console.log(`LLDB process exited with code ${code} and signal ${signal}`);
});

lldb.on('breakpoint', (data) => {
    console.log('Breakpoint hit:', data);
    runTest();
});

lldb.on('paused', (data) => {
    console.log('Program Paused:', data);
    (async () => {
        const continueResponse = await lldb.continue();
        console.log('Continue Response:', continueResponse);})();
});

lldb.on('stopped', (data) => {
    console.log('Program Stopped:', data);
});

lldb.on('exited', (data) => {
    isRunning = false;
    console.log('Program Exited:', data);
});

lldb.on('initialized', (data) => {
    console.log('LLDB initialized');
    setupAndRun();
});

function runTest(){
    (async () => {
        console.log('Fetching breakpoints');
        const breakpoints = await lldb.getBreakpoints();
        console.log('Breakpoints:', breakpoints);

        lldb.sleep(50);

        console.log('Fetching all variables in current frame');
        const variables = await lldb.getAllVariablesInCurrentFrame();
        console.log('Variables:', JSON.stringify(variables, null, 2));

        lldb.sleep(50);

        console.log('Fetching specific variable (y) in current frame');
        const variableY = await lldb.getVariableInCurrentFrame('y');
        console.log('Variable Y:', variableY);
        
        lldb.sleep(50);
        
        console.log('Using expression to evaluate x + y');
        const expressionResponse = await lldb.evaluateExpression('x + y');
        console.log('Expression Response:', expressionResponse);
        
        lldb.sleep(50);
        
        console.log('List Threads');
        const threads = await lldb.listThreads();
        console.log('Threads:', threads);
        
        lldb.sleep(50);
        
        console.log('Getting current thread');
        const currentThread = await lldb.getCurrentThread();
        console.log('Current Thread:', currentThread);
        
        lldb.sleep(50);
        
        console.log('Get Backtrace');
        const backtrace = await lldb.getThreadBacktrace({ count: 20 });
        console.log('Backtrace:', backtrace);
        
        lldb.sleep(50);

        console.log('Read Memory');
        const memory = await lldb.readMemory('$rsp', {size: 8,format: 'x',count: 4,});
        console.log('Memory:', memory);

        lldb.sleep(50);

        console.log('Custom Command');
        const customCommand = await lldb.sendRawCommand('expression -l c++ -- x + y');
        console.log('Custom Command:', customCommand);

        lldb.sleep(50);
        
        console.log('Continuing program execution');
        const continueResponse = await lldb.continue();
        console.log('Continue Response:', continueResponse);
        
        lldb.sleep(50);
        
        if(isRunning){
            console.log('Pausing program execution');
            const pauseResponse = await lldb.pause();
            console.log('Pause Response:', pauseResponse);
        }

    })();
}

function setupAndRun(){
    (async () => {
        console.log('Setting breakpoint at main');
        const breakpointNameResponse = await lldb.setBreakpointByName('main');
        console.log('Breakpoint Name Response:', breakpointNameResponse);
        
        lldb.sleep(50);
        
        console.log('Setting breakpoint in file');
        const breakpointFileResponse = await lldb.setBreakpoint(sourcePath, 21);
        console.log('Breakpoint File Response:', breakpointFileResponse);
        
        lldb.sleep(50);
        
        console.log('Setting breakpoint in file');
        const breakpointFileResponse2 = await lldb.setBreakpoint(sourcePath,25);
        console.log('Breakpoint File Response:', breakpointFileResponse2);
        
        lldb.sleep(50);
        
        console.log('Setting breakpoint in file');
        const breakpointFileResponse3 = await lldb.setBreakpoint(sourcePath, 28);
        console.log('Breakpoint File Response:', breakpointFileResponse3);
        
        lldb.sleep(50);
        
        console.log('Fetching breakpoints');
        const breakpoints = await lldb.getBreakpoints();
        console.log('Breakpoints:', breakpoints);
        
        lldb.sleep(50);
        
        console.log('Starting the program');
        const runResponse = await lldb.run();
        console.log('Run Response:', runResponse);
        isRunning = true;
        lldb.sleep(50);
        
    })();
}

(async () => {
    try {
        console.log('Initializing LLDB...');
        const initResponse = await lldb.start();
        console.log('Initialization Response:', initResponse);

    } catch (error) {
        console.error('Error during LLDB operations:', error);
    }

})();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.on('line', (input) => {
    if (input.includes('exit')) {
        lldb.terminate();
        process.exit(0);
    }
    lldb.sendCommand(input);
});

rl.on('close', () => {
    lldb.terminate();
    process.exit(0);
});
