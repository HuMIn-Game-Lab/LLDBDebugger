// commands/debugger-commands.js
class DebuggerCommands {
    constructor(core) {
        this.core = core;
    }

    async setBreakpoint(file, line) {
        return this.core.executeCommand('setBreakpoint', file, line);
    }

    async getBreakpoints() {
        return this.core.executeCommand('getBreakpoints');
    }

    async getAllVariables() {
        return this.core.executeCommand('getAllVariablesInCurrentFrame');
    }

    async run() {
        return this.core.executeCommand('run');
    }

    async continue() {
        return this.core.executeCommand('continue');
    }

    async pause() {
        return this.core.executeCommand('pause');
    }

    async step() {
        return this.core.executeCommand('step');
    }

    async listThreads() {
        return this.core.executeCommand('listThreads');
    }

    async getBacktrace(options = { count: 20 }) {
        return this.core.executeCommand('getThreadBacktrace', options);
    }
}

window.DebuggerCommands = DebuggerCommands;