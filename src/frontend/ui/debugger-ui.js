// ui/debugger-ui.js
class DebuggerUI {
    constructor() {
        this.setupPanels();
        this.setupStyles();
        this.messageCount = 0;
        this.maxMessages = 1000; // Prevent memory issues with large message logs
    }

    setupPanels() {
        this.panels = {
            output: document.getElementById('outputPanel'),
            messages: document.getElementById('messagePanel'),
            variables: document.getElementById('variablesPanel'),
            breakpoints: document.getElementById('breakpointsPanel'),
            threads: document.getElementById('threadsPanel'),
            stack: document.getElementById('stackPanel'),
            memory: document.getElementById('memoryPanel')
        };

        // Verify panels exist
        Object.entries(this.panels).forEach(([name, panel]) => {
            if (!panel) {
                console.error(`Panel '${name}' not found in DOM`);
            }
        });
    }

    setupStyles() {
        this.messageStyles = {
            outgoing: 'border-blue-500 bg-blue-50',
            incoming: 'border-green-500 bg-green-50',
            error: 'border-red-500 bg-red-50',
            event: 'border-purple-500 bg-purple-50',
            debug: 'border-gray-500 bg-gray-50'
        };

        this.logStyles = {
            error: 'text-red-600',
            warning: 'text-yellow-600',
            success: 'text-green-600',
            info: 'text-blue-600',
            debug: 'text-gray-600'
        };
    }

    setConnectionStatus(connected) {
        const status = document.getElementById('connectionStatus');
        if (status) {
            status.textContent = connected ? 'Connected' : 'Disconnected';
            status.className = connected 
                ? 'text-center py-2 rounded bg-green-100 text-green-800'
                : 'text-center py-2 rounded bg-red-100 text-red-800';
        }
    }

    setControlsEnabled(enabled) {
        document.querySelectorAll('button:not(#connectBtn)').forEach(button => {
            button.disabled = !enabled;
            button.classList.toggle('opacity-50', !enabled);
            button.classList.toggle('cursor-not-allowed', !enabled);
        });
    }

    displayMessage(type, data) {
        if (!this.panels.messages) return;

        // Manage message count
        if (this.messageCount >= this.maxMessages) {
            const firstMessage = this.panels.messages.firstChild;
            if (firstMessage) {
                this.panels.messages.removeChild(firstMessage);
            }
        } else {
            this.messageCount++;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message-${type} border-l-4 p-4 mb-2 ${this.messageStyles[type] || this.messageStyles.debug}`;

        // Create timestamp and type header
        const header = document.createElement('div');
        header.className = 'font-mono text-sm text-gray-600 mb-2 flex justify-between items-center';
        header.innerHTML = `
            <span>[${new Date().toISOString()}]</span>
            <span class="font-semibold">${type.toUpperCase()}</span>
        `;
        messageDiv.appendChild(header);

        // Create formatted content
        const content = document.createElement('pre');
        content.className = 'text-xs bg-white p-2 rounded overflow-x-auto';
        content.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        messageDiv.appendChild(content);

        this.panels.messages.appendChild(messageDiv);
        this.panels.messages.scrollTop = this.panels.messages.scrollHeight;
    }

    log(message, level = 'info') {
        if (!this.panels.output) return;

        const logDiv = document.createElement('div');
        logDiv.className = `p-2 font-mono text-sm ${this.logStyles[level] || this.logStyles.debug}`;
        logDiv.textContent = `[${new Date().toISOString()}] ${message}`;
        
        this.panels.output.appendChild(logDiv);
        this.panels.output.scrollTop = this.panels.output.scrollHeight;
    }

    updateVariablesTable(variables) {
        if (!this.panels.variables) return;

        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        
        const thead = document.createElement('thead');
        thead.className = 'bg-gray-50';
        thead.innerHTML = `
            <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.className = 'bg-white divide-y divide-gray-200';

        variables.forEach(variable => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${variable.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${variable.type}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${variable.value}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button onclick="debuggerInterface.inspectVariable('${variable.name}')"
                            class="text-blue-600 hover:text-blue-900">
                        Inspect
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.panels.variables.innerHTML = '';
        this.panels.variables.appendChild(table);
    }

    updateBreakpoints(breakpoints) {
        if (!this.panels.breakpoints) return;

        const container = document.createElement('div');
        container.className = 'space-y-2';

        breakpoints.forEach(bp => {
            const breakpointDiv = document.createElement('div');
            breakpointDiv.className = 'p-4 bg-white shadow rounded-lg flex justify-between items-center';
            breakpointDiv.innerHTML = `
                <div>
                    <div class="font-medium text-gray-900">${bp.file}:${bp.line}</div>
                    <div class="text-sm text-gray-500">
                        ID: ${bp.id}
                        ${bp.condition ? `| Condition: ${bp.condition}` : ''}
                    </div>
                </div>
                <button onclick="debuggerInterface.removeBreakpoint(${bp.id})"
                        class="text-red-600 hover:text-red-900">
                    Remove
                </button>
            `;
            container.appendChild(breakpointDiv);
        });

        this.panels.breakpoints.innerHTML = '';
        this.panels.breakpoints.appendChild(container);
    }

    updateThreads(threads) {
        if (!this.panels.threads) return;

        const container = document.createElement('div');
        container.className = 'space-y-2';

        threads.forEach(thread => {
            const threadDiv = document.createElement('div');
            threadDiv.className = 'p-4 bg-white shadow rounded-lg';
            threadDiv.innerHTML = `
                <div class="font-medium text-gray-900">Thread #${thread.threadId}</div>
                <div class="mt-2 text-sm text-gray-500">
                    <div>Name: ${thread.name || 'Unknown'}</div>
                    <div>State: ${thread.state || 'Unknown'}</div>
                    <div>Queue: ${thread.queue || 'Unknown'}</div>
                    <div>Stop Reason: ${thread.stopReason || 'Unknown'}</div>
                </div>
            `;
            container.appendChild(threadDiv);
        });

        this.panels.threads.innerHTML = '';
        this.panels.threads.appendChild(container);
    }

    updateStackTrace(frames) {
        if (!this.panels.stack) return;

        const container = document.createElement('div');
        container.className = 'space-y-2';

        frames.forEach((frame, index) => {
            const frameDiv = document.createElement('div');
            frameDiv.className = 'p-4 bg-white shadow rounded-lg';
            frameDiv.innerHTML = `
                <div class="font-medium text-gray-900">Frame #${index}</div>
                <div class="mt-2 text-sm text-gray-500">
                    <div>Function: ${frame.functionName || frame.name}</div>
                    <div>Location: ${frame.file}:${frame.line}</div>
                    <div class="font-mono text-xs">${frame.address || ''}</div>
                </div>
            `;
            container.appendChild(frameDiv);
        });

        this.panels.stack.innerHTML = '';
        this.panels.stack.appendChild(container);
    }

    updateMemoryView(memoryData) {
        if (!this.panels.memory) return;

        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        
        table.innerHTML = `
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hex</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ASCII</th>
                </tr>
            </thead>
        `;

        const tbody = document.createElement('tbody');
        tbody.className = 'bg-white divide-y divide-gray-200';

        memoryData.forEach(row => {
            const tr = document.createElement('tr');
            const ascii = this.hexToAscii(row.value);
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900">${row.address}</td>
                <td class="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-500">${row.value}</td>
                <td class="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-500">${ascii}</td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.panels.memory.innerHTML = '';
        this.panels.memory.appendChild(table);
    }

    hexToAscii(hex) {
        const hexBytes = hex.match(/.{2}/g) || [];
        return hexBytes.map(byte => {
            const charCode = parseInt(byte, 16);
            return (charCode >= 32 && charCode <= 126) ? String.fromCharCode(charCode) : '.';
        }).join('');
    }

    clearAll() {
        Object.values(this.panels).forEach(panel => {
            if (panel) {
                panel.innerHTML = '';
            }
        });
        this.messageCount = 0;
    }
}

window.DebuggerUI = DebuggerUI;