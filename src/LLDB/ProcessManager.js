
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class ProcessManager extends EventEmitter {
  constructor(command, args = []) {
    super();
    this.command = command;
    this.args = args;
    this.process = null;
  }

  spawn() {
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'], // Ensure the process does not inherit the parent's stdio
      ...this.options, // Allow overriding options if needed
  });
    // this.process = spawn(this.command, this.args);

    this.process.stdout.on('data', (data) => {
      this.emit('stdout', data.toString());
    });

    this.process.stderr.on('data', (data) => {
      this.emit('stderr', data.toString());
    });

    this.process.on('error', (error) => {
      this.emit('error', error);
    });

    this.process.on('exit', (code, signal) => {
      this.emit('exit', code, signal);
    });
  }

  sendCommand(command) {
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(command + '\n');
    } else {
      this.emit('error', new Error('Process not running or stdin not writable'));
    }
  }

  terminate() {
    if (this.process) {
      this.process.kill();
    }
  }
}

module.exports = ProcessManager;