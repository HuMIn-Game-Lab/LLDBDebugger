# LLDB WebSocket Interface User Guide

## Table of Contents
1. Introduction
2. Prerequisites
3. Architecture Overview
4. Getting Started
5. LLDBClient API Reference
6. WebSocket Server Interface
7. Event System
8. Debugging Best Practices
9. Example Usage

## 1. Introduction

The LLDB WebSocket Interface provides a Node.js wrapper around LLDB, enabling remote debugging of C++ applications through a WebSocket interface. This system consists of two main components:
- LLDBClient: A direct wrapper around LLDB
- LLDBWebSocketServer: A WebSocket server that exposes LLDB functionality

## 2. Prerequisites

- Node.js (Latest LTS version recommended)
- LLDB (Must be accessible via command line)
- C++ compiler with debug symbol support
- Required Node.js packages:
  ```json
  {
    "dependencies": {
      "winston": "^3.17.0",
      "ws": "^8.18.0"
    }
  }
  ```

## 3. Architecture Overview

The system consists of three main layers:

1. ProcessManager: Base layer that handles process spawning and basic I/O
2. LLDBClient: Wraps LLDB functionality with a structured API
3. LLDBWebSocketServer: Provides WebSocket interface to LLDBClient

### Project Structure
```
src/
├── frontend/           # Web interface files
├── LLDB/              # Core LLDB integration
│   ├── LLDBClient.js
│   ├── LLDBWebSocketServer.js
│   └── ProcessManager.js
└── utils/
    └── logger.js      # Logging utility

test/
└── fixtures/          # Test program and debug symbols
```

## 4. Getting Started

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile your C++ program with debug symbols:
   ```bash
   g++ -g program.cpp -o program
   ```

### Starting the Server

```bash
# Normal mode
node server.js

# Debug mode with verbose logging
LOG_LEVEL=debug node server.js
```

### Important Notes

- Debug symbols (.dSYM files) must remain in their original compilation location
- The system processes one LLDB command at a time
- Allow 50ms minimum delay between commands for reliable operation

## 5. LLDBClient API Reference

### Initialization Methods

```javascript
start()
// Initializes LLDB
// Returns: Promise<string> - Initialization response

sleep(ms)
// Delays execution
// Parameters: ms (number) - Milliseconds to sleep
// Returns: Promise<void>
```

### Breakpoint Management

```javascript
setBreakpoint(file: string, line: number)
// Sets breakpoint at specified file and line
// Returns: Promise<string> - Breakpoint information

setBreakpointByName(name: string)
// Sets breakpoint at function name
// Returns: Promise<string> - Breakpoint information

getBreakpoints()
// Lists all breakpoints
// Returns: Promise<Array> - Array of breakpoint objects
```

### Program Control

```javascript
run()
// Starts program execution
// Returns: Promise<{processId: number, programPath: string}>

continue()
// Continues program execution
// Returns: Promise<string>

pause()
// Pauses program execution
// Returns: Promise<number> - Process ID

stop()
// Stops debugging session
// Returns: Promise<void>
```

### Variable and Memory Inspection

```javascript
getAllVariablesInCurrentFrame()
// Gets all variables in current stack frame
// Returns: Promise<Array<{type: string, name: string, value: string}>>

getVariableInCurrentFrame(name: string)
// Gets specific variable value
// Returns: Promise<Array<{type: string, name: string, value: string}>>

evaluateExpression(expression: string, options?: Object)
// Evaluates expression in current context
// Returns: Promise<{variableName: string, variableValue: string}>

readMemory(address: string, options: {size?: number, format?: string, count?: number})
// Reads memory at specified address
// Returns: Promise<{rawOutput: string, memoryData: Array}>
```

### Thread Management

```javascript
listThreads()
// Lists all threads
// Returns: Promise<{threads: Array, rawOutput: string}>

getCurrentThread()
// Gets current thread information
// Returns: Promise<{threadId: number, details: string}>

getThreadBacktrace(options: {count?: number})
// Gets thread backtrace
// Returns: Promise<{threadInfo: Object, frames: Array}>
```

## 6. WebSocket Server Interface

### Connection

```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### Message Format

#### Client to Server:
```javascript
{
  command: string,     // 'initialize' or 'execute'
  id: number,         // Message identifier
  programPath?: string, // Required for 'initialize'
  method?: string,    // Required for 'execute'
  args?: Array        // Arguments for method
}
```

#### Server to Client:
```javascript
{
  type: string,       // Response type (e.g., 'initializeResponse')
  id: number,         // Matching message identifier
  data?: any,         // Response data
  message?: string    // Error message if applicable
}
```

## 7. Event System

The following events are emitted and should be handled by clients:

### Core Events
- `initialized`: LLDB is ready for commands
- `prompt`: LLDB prompt is ready
- `stdout`: Standard output from program
- `stderr`: Standard error from program
- `exited`: Program has exited

### Debug Events
- `breakpoint`: Breakpoint hit
- `paused`: Program paused
- `stopped`: Program stopped

### Event Handling Example
```javascript
ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type.endsWith('Event')) {
    handleEvent(message.type.replace('Event', ''), message.data);
  }
});
```

## 8. Debugging Best Practices

1. Command Timing
   - Allow 50ms minimum between commands
   - Use the `sleep()` method for reliable command sequencing

2. Error Handling
   - Always implement error handlers for WebSocket connections
   - Handle all possible events
   - Implement reconnection logic

3. Memory Management
   - Close connections properly when done
   - Handle cleanup in error scenarios

4. Logging
   - Use appropriate log levels for different environments
   - Monitor error.log and combined.log for issues

## 9. Example Usage

### Direct LLDBClient Usage
```javascript
const LLDBClient = require('./src/LLDB/LLDBClient');
const lldb = new LLDBClient('/path/to/program');

async function debug() {
  await lldb.start();
  await lldb.setBreakpoint('program.cpp', 10);
  await lldb.run();
  
  lldb.on('breakpoint', async (data) => {
    const vars = await lldb.getAllVariablesInCurrentFrame();
    console.log('Variables:', vars);
    await lldb.continue();
  });
}
```

### WebSocket Client Usage
```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  ws.send(JSON.stringify({
    command: 'initialize',
    id: 1,
    programPath: '/path/to/program'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'initializeResponse') {
    ws.send(JSON.stringify({
      command: 'execute',
      id: 2,
      method: 'setBreakpoint',
      args: ['program.cpp', 10]
    }));
  }
};
```

For more examples and detailed information, refer to the test.js and client.js files in the repository.