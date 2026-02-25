let cachedTools = [];
let cachedProfiles = [];
let activeProfileId = 'default';
let hitlPollInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    await fetchProfiles();
    fetchTools();
    setupTabs();
    startHitlPolling();
});

async function fetchProfiles() {
    try {
        const res = await fetch('/api/profiles');
        cachedProfiles = await res.json();

        const selector = document.getElementById('profile-selector');
        selector.innerHTML = '';
        let foundActive = false;

        cachedProfiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            selector.appendChild(opt);
            if (p.id === activeProfileId) foundActive = true;
        });

        if (!foundActive && cachedProfiles.length > 0) {
            activeProfileId = cachedProfiles[0].id;
        }
        selector.value = activeProfileId;

        updateTokenUI();

        // Add single listener conditionally if needed, safer to just replace it or ensure it only fires on change
    } catch (e) {
        console.error("Failed to fetch profiles", e);
    }
}

// Global listener for selector
document.getElementById('profile-selector').addEventListener('change', (e) => {
    activeProfileId = e.target.value;
    updateTokenUI();
    fetchTools();
});

function updateTokenUI() {
    const profile = cachedProfiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    document.getElementById('active-profile-token').textContent = profile.token;
    document.getElementById('delete-profile-btn').style.display = (profile.id === 'default') ? 'none' : 'inline-block';
}

async function createProfile() {
    const name = prompt("Enter a name for the new AI Agent Profile:");
    if (!name) return;

    try {
        const res = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            const p = await res.json();
            activeProfileId = p.id;
            await fetchProfiles();
            fetchTools();
        }
    } catch (e) { alert("Error creating profile"); }
}

async function deleteProfile() {
    if (!confirm("Are you sure you want to delete this profile?")) return;
    try {
        const res = await fetch(`/api/profiles/${activeProfileId}`, { method: 'DELETE' });
        if (res.ok) {
            activeProfileId = 'default';
            await fetchProfiles();
            fetchTools();
        }
    } catch (e) { alert("Error deleting profile"); }
}

async function regenerateToken() {
    if (!confirm("Are you sure you want to regenerate the Bearer token? Existing network connections for this Agent will drop immediately.")) return;
    try {
        const res = await fetch(`/api/profiles/${activeProfileId}/regenerate`, { method: 'POST' });
        if (res.ok) {
            await fetchProfiles();
        }
    } catch (e) { alert("Error regenerating token"); }
}

function copyToken() {
    const token = document.getElementById('active-profile-token').textContent;
    navigator.clipboard.writeText(token);
    const btn = document.getElementById('copy-token-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy Token', 2000);
}

async function fetchConnections() {
    try {
        const response = await fetch('/api/connections');
        const connections = await response.json();

        const tbody = document.getElementById('connections-table-body');
        tbody.innerHTML = '';

        if (connections.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 16px; color: var(--text-secondary);">No active connections found.</td></tr>';
            return;
        }

        connections.forEach(conn => {
            const tr = document.createElement('tr');
            const connectedDate = new Date(conn.connectedAt).toLocaleString();

            tr.innerHTML = `
                <td><code style="font-size: 12px; background: var(--bg-color); padding: 4px; border-radius: 4px; color: var(--text-primary);">${conn.sessionId}</code></td>
                <td style="font-weight: 500;">${conn.profileName}</td>
                <td style="color: var(--text-secondary);">${connectedDate}</td>
                <td><span style="color: var(--success-color); font-size: 12px; display: inline-flex; align-items: center; gap: 6px;"><span class="status-dot online" style="position: static; margin: 0;"></span>Connected</span></td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Failed to fetch connections", e);
        document.getElementById('connections-table-body').innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--danger-color);">Error loading connections</td></tr>';
    }
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.view-section, .tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Find target section and activate
            const targetId = tab.getAttribute('data-tab') || tab.getAttribute('data-target').replace('view-', '');

            // Map legacy IDs if needed, else exact match
            const validTargets = {
                'tools': 'view-tools',
                'connections': 'connections-view',
                'logs': 'view-logs',
                'analytics': 'view-analytics'
            };

            const targetElem = document.getElementById(targetId) || document.getElementById(validTargets[targetId]);
            if (targetElem) {
                targetElem.classList.add('active');
            }

            // Refresh content based on tab
            if (targetId === 'logs') loadAuditLogs(); // Changed from fetchAuditLogs to loadAuditLogs to match existing function name
            if (targetId === 'analytics') loadAnalytics(); // Changed from fetchAnalytics to loadAnalytics to match existing function name
            if (targetId === 'connections') fetchConnections();
        });
    });
}

function closeLogModal() {
    document.getElementById('log-detail-modal').style.display = 'none';
}

function showLogModal(log) {
    document.getElementById('modal-tool-name').textContent = log.tool_name;

    let paramsDisplay = log.parameters;
    try { paramsDisplay = JSON.stringify(JSON.parse(log.parameters), null, 2); } catch (e) { }

    let resultDisplay = log.result;
    try {
        // Try formatting JSON if the result is stringified JSON
        if (resultDisplay.startsWith('{') || resultDisplay.startsWith('[')) {
            resultDisplay = JSON.stringify(JSON.parse(resultDisplay), null, 2);
        }
    } catch (e) { }

    document.getElementById('modal-parameters').textContent = paramsDisplay;
    document.getElementById('modal-result').textContent = resultDisplay;

    // Show modal
    document.getElementById('log-detail-modal').style.display = 'flex';
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    // Close log detail modal
    const modal = document.getElementById('log-detail-modal');
    if (e.target === modal) {
        closeLogModal();
    }

    // Close HITL panel if clicking outside it
    const hitlPanel = document.getElementById('hitl-panel');
    const hitlBellBtn = document.getElementById('hitl-bell-btn');
    if (hitlPanel && hitlPanel.style.display === 'flex') {
        // If the click is not inside the panel, and the click is not on the bell button (which toggles it)
        if (!hitlPanel.contains(e.target) && !hitlBellBtn.contains(e.target)) {
            hitlPanel.style.display = 'none';
        }
    }
});

async function loadAuditLogs() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading logs...</td></tr>';

    try {
        const response = await fetch('/api/audit/logs?limit=100');
        if (!response.ok) throw new Error('Network response was not ok');
        const logs = await response.json();

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 24px;">No execution logs found.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        logs.forEach(log => {
            const tr = document.createElement('tr');
            tr.className = 'clickable-row';
            tr.onclick = () => showLogModal(log);

            const date = new Date(log.timestamp).toLocaleString();
            const statusClass = log.is_error ? 'error' : 'success';
            const statusText = log.is_error ? 'Failed' : 'Success';

            // Safe parsing for display
            let paramsDisplay = log.parameters;
            try { paramsDisplay = JSON.stringify(JSON.parse(log.parameters), null, 2); } catch (e) { }

            tr.innerHTML = `
                <td><span style="white-space:nowrap">${date}</span></td>
                <td><strong>${escapeHtml(log.tool_name)}</strong></td>
                <td class="code-cell"><div class="truncate-text">${escapeHtml(paramsDisplay)}</div></td>
                <td class="code-cell"><div class="truncate-text">${escapeHtml(log.result)}</div></td>
                <td><span class="log-status ${statusClass}">${statusText}</span></td>
                <td>${log.token_usage || 0}</td>
                <td>${log.duration_ms}ms</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger-color)">Error loading logs: ${error.message}</td></tr>`;
    }
}

async function loadAnalytics() {
    const summaryContainer = document.getElementById('analytics-summary');
    const breakdownContainer = document.getElementById('analytics-breakdown');

    summaryContainer.innerHTML = '<div class="loading">Loading analytics...</div>';
    breakdownContainer.innerHTML = '';

    try {
        const response = await fetch('/api/audit/analytics');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        // Check if database is empty basically
        if (data.totalRuns === 0 && !data.toolBreakdown) {
            summaryContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 24px;">No data available yet.</div>';
            return;
        }

        // Render Summary Cards
        summaryContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${data.totalRuns}</div>
                <div class="stat-label">Total Executions</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: ${data.successRate < 90 ? 'var(--danger-color)' : 'var(--success-color)'}">
                    ${data.successRate.toFixed(1)}%
                </div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${data.avgDurationMs}ms</div>
                <div class="stat-label">Avg. Duration</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--warning-color)">${data.totalTokens.toLocaleString()}</div>
                <div class="stat-label">Total Tokens</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--danger-color)">${data.totalErrors}</div>
                <div class="stat-label">Total Errors</div>
            </div>
        `;

        // Render Breakdown
        if (data.toolBreakdown && data.toolBreakdown.length > 0) {
            let html = '';
            data.toolBreakdown.forEach(item => {
                const failRate = ((item.error_count / item.count) * 100).toFixed(1);
                const avgDur = Math.round(item.avg_duration);
                const totalTokens = (item.total_tokens || 0).toLocaleString();
                html += `
                    <div class="breakdown-item">
                        <div class="breakdown-name">${escapeHtml(item.tool_name)}</div>
                        <div class="breakdown-stats">
                            <span><strong>${item.count}</strong> runs</span>
                            <span style="color: ${item.error_count > 0 ? 'var(--danger-color)' : ''}"><strong>${item.error_count}</strong> errors (${failRate}%)</span>
                            <span><strong>${avgDur}ms</strong> avg</span>
                            <span style="color: var(--warning-color)"><strong>${totalTokens}</strong> tokens</span>
                        </div>
                    </div>
                `;
            });
            breakdownContainer.innerHTML = html;
        } else {
            breakdownContainer.innerHTML = '<div style="text-align:center; color: var(--text-secondary)">No tool breakdown available.</div>';
        }

    } catch (error) {
        summaryContainer.innerHTML = `<div style="grid-column: 1/-1; color:var(--danger-color)">Error loading analytics: ${error.message}</div>`;
    }
}

async function fetchTools() {
    const grid = document.getElementById('categories-grid');
    const stats = document.getElementById('tools-stats');

    try {
        const response = await fetch(`/api/tools?profileId=${activeProfileId}`);
        if (!response.ok) throw new Error('Network response was not ok');

        cachedTools = await response.json();

        // If we are currently in a drill-down view, refresh just that view. Otherwise refresh categories.
        const toolsGrid = document.getElementById('tools-grid');
        if (toolsGrid.style.display === 'grid') {
            const currentCategory = document.getElementById('tools-main-title').textContent.replace(' Package', '');
            const filtered = cachedTools.filter(t => (t.category || 'Uncategorized') === currentCategory);
            showCategoryDetails(currentCategory, filtered);
        } else {
            showCategories();
            renderCategories(cachedTools, grid, stats);
        }

    } catch (error) {
        console.error('Failed to fetch tools:', error);
        grid.innerHTML = `<div class="loading" style="color: var(--danger-color)">Error loading tools. Is the server running?</div>`;
        stats.textContent = 'Disconnected';
    }
}

function renderCategories(tools, grid, stats) {
    grid.innerHTML = ''; // Clear loading state

    const categories = {};
    let totalEnabledTools = 0;

    // Group tools
    tools.forEach(tool => {
        if (tool.isEnabled) totalEnabledTools++;

        const catName = tool.category || 'Uncategorized';
        if (!categories[catName]) {
            categories[catName] = { name: catName, tools: [], enabledCount: 0 };
        }
        categories[catName].tools.push(tool);
        if (tool.isEnabled) categories[catName].enabledCount++;
    });

    // Render
    Object.values(categories).forEach((cat, index) => {
        const isFullyEnabled = cat.enabledCount === cat.tools.length;
        const isPartiallyEnabled = cat.enabledCount > 0 && cat.enabledCount < cat.tools.length;

        const cardClass = isFullyEnabled ? 'enabled' : (isPartiallyEnabled ? 'partial' : 'disabled');
        const checkedState = isFullyEnabled || isPartiallyEnabled ? 'checked' : '';

        const card = document.createElement('div');
        card.className = `category-card ${cardClass}`;
        card.style.animationDelay = `${index * 0.05}s`;

        card.onclick = (e) => {
            if (e.target.closest('.switch')) return; // Ignore toggles
            showCategoryDetails(cat.name, cat.tools);
        };

        card.innerHTML = `
            <div class="category-header">
                <div class="category-name">${escapeHtml(cat.name)}</div>
                <label class="switch">
                    <input type="checkbox" onchange="toggleCategory('${escapeHtml(cat.name)}', this.checked)" ${checkedState}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="category-stats">
                ${cat.enabledCount} of ${cat.tools.length} active
            </div>
            <div class="category-footer">
                <span style="font-size: 13px; color: var(--accent-color);">View Tools &rarr;</span>
            </div>
        `;

        grid.appendChild(card);
    });

    stats.textContent = `${totalEnabledTools} of ${tools.length} Tools Active`;
}

async function toggleCategory(categoryName, isEnabled) {
    try {
        const response = await fetch(`/api/categories/${encodeURIComponent(categoryName)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isEnabled, profileId: activeProfileId })
        });

        if (!response.ok) throw new Error('Failed to toggle category');
        fetchTools();
    } catch (error) {
        console.error(`Failed to toggle category ${categoryName}:`, error);
        alert(`Error toggling category ${categoryName}. Please try again.`);
        fetchTools();
    }
}

function showCategoryDetails(categoryName, tools) {
    document.getElementById('categories-grid').style.display = 'none';
    document.getElementById('tools-grid').style.display = 'grid';
    document.getElementById('back-to-categories-btn').style.display = 'inline-block';

    // Setup Toggle All button
    const toggleAllBtn = document.getElementById('toggle-all-category-btn');
    toggleAllBtn.style.display = 'inline-block';

    const enabledCount = tools.filter(t => t.isEnabled).length;
    const isFullyEnabled = enabledCount === tools.length;

    toggleAllBtn.textContent = isFullyEnabled ? 'Deactivate All' : 'Activate All';
    toggleAllBtn.onclick = () => {
        // Optimistically update button text
        toggleAllBtn.textContent = isFullyEnabled ? 'Activating...' : 'Deactivating...';
        toggleCategory(categoryName, !isFullyEnabled);
    };

    document.getElementById('tools-main-title').textContent = escapeHtml(categoryName) + ' Package';

    const grid = document.getElementById('tools-grid');
    const stats = document.getElementById('tools-stats');
    renderTools(tools, grid, stats);
}

function showCategories() {
    document.getElementById('categories-grid').style.display = 'grid';
    document.getElementById('tools-grid').style.display = 'none';
    document.getElementById('back-to-categories-btn').style.display = 'none';
    document.getElementById('toggle-all-category-btn').style.display = 'none';
    document.getElementById('tools-main-title').textContent = 'Available Packages';

    if (cachedTools.length > 0) {
        const grid = document.getElementById('categories-grid');
        const stats = document.getElementById('tools-stats');
        renderCategories(cachedTools, grid, stats);
    }
}

function renderTools(tools, grid, stats) {
    grid.innerHTML = ''; // Clear loading state

    let enabledCount = 0;

    tools.forEach((tool, index) => {
        if (tool.isEnabled) enabledCount++;

        const card = document.createElement('div');
        card.className = `tool-card ${tool.isEnabled ? 'enabled' : 'disabled'}`;
        card.style.animationDelay = `${index * 0.05}s`; // Staggered fade in

        let formBuilderHMTL = buildFormHtml(tool);

        card.innerHTML = `
            <div class="tool-header">
                <div class="tool-name-container">
                    <span class="tool-name">${tool.name}</span>
                </div>
                <label class="switch">
                    <input type="checkbox" onchange="toggleTool('${tool.name}', this.checked)" ${tool.isEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="tool-description">${escapeHtml(tool.description)}</div>
            <div class="tool-footer">
                <span class="status-badge" id="badge-${tool.name}">${tool.isEnabled ? 'Active' : 'Disabled'}</span>
                <button class="tool-test-btn" onclick="toggleTestPanel('${tool.name}')">Test Tool</button>
            </div>
            <div class="tool-approval-row">
                <span class="tool-approval-label"><span class="shield-icon">🛡️</span> Require Approval</span>
                <label class="switch" style="width:36px; height:20px;">
                    <input type="checkbox" onchange="toggleApproval('${tool.name}', this.checked)" ${tool.requiresApproval ? 'checked' : ''}>
                    <span class="slider" style="border-radius:20px;"></span>
                </label>
            </div>
            
            <div class="test-panel" id="test-panel-${tool.name}">
                <form id="form-${tool.name}" onsubmit="executeTool(event, '${tool.name}')">
                    ${formBuilderHMTL}
                    <button type="submit" class="execute-btn" id="btn-${tool.name}">Execute Tool</button>
                </form>
                <div class="test-output" id="output-${tool.name}"></div>
            </div>
        `;

        grid.appendChild(card);
    });

    stats.textContent = `${enabledCount} of ${tools.length} Tools Active`;
}

function buildFormHtml(tool) {
    if (!tool.inputSchema || !tool.inputSchema.properties) {
        return '<p style="color:var(--text-secondary); margin-bottom: 12px; font-size:12px;">No parameters required.</p>';
    }

    const props = tool.inputSchema.properties;
    const required = tool.inputSchema.required || [];
    let html = '';

    for (const [key, value] of Object.entries(props)) {
        const isRequired = required.includes(key);
        const reqStar = isRequired ? '<span style="color:var(--danger-color)">*</span>' : '';
        const desc = value.description ? `<br><small style="color:var(--text-secondary)">${escapeHtml(value.description)}</small>` : '';

        html += `<div class="form-group">
            <label for="input-${tool.name}-${key}">${key} ${reqStar} ${desc}</label>`;

        if (value.type === 'string' && value.description && value.description.toLowerCase().includes('content')) {
            // Multiline for content 
            html += `<textarea id="input-${tool.name}-${key}" name="${key}" rows="3" ${isRequired ? 'required' : ''}></textarea>`;
        } else {
            html += `<input type="${value.type === 'number' ? 'number' : 'text'}" id="input-${tool.name}-${key}" name="${key}" ${isRequired ? 'required' : ''}>`;
        }
        html += `</div>`;
    }

    return html;
}

function toggleTestPanel(name) {
    const panel = document.getElementById(`test-panel-${name}`);
    if (panel.classList.contains('active')) {
        panel.classList.remove('active');
    } else {
        // Hide all others first to keep it clean
        document.querySelectorAll('.test-panel').forEach(p => p.classList.remove('active'));
        panel.classList.add('active');
    }
}

async function executeTool(event, name) {
    event.preventDefault();

    const form = event.target;
    const btn = document.getElementById(`btn-${name}`);
    const outputDiv = document.getElementById(`output-${name}`);

    // Read form values
    const formData = new FormData(form);
    const args = {};
    for (let [key, value] of formData.entries()) {
        if (value.trim() !== '') {
            // Basic casting
            const tool = cachedTools.find(t => t.name === name);
            const propType = tool?.inputSchema?.properties?.[key]?.type;
            if (propType === 'number') {
                args[key] = Number(value);
            } else if (propType === 'boolean') {
                args[key] = value === 'true';
            } else if (propType === 'array' || propType === 'object') {
                try { args[key] = JSON.parse(value); } catch (e) { args[key] = value; }
            } else {
                args[key] = value;
            }
        }
    }

    // UI state
    btn.disabled = true;
    btn.textContent = 'Executing...';
    outputDiv.style.display = 'none';
    outputDiv.className = 'test-output';
    outputDiv.textContent = '';

    try {
        const response = await fetch(`/api/tools/${name}/execute?profileId=${activeProfileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(args)
        });

        const result = await response.json();

        outputDiv.style.display = 'block';
        if (!response.ok || (result.isError)) {
            outputDiv.classList.add('error');
            outputDiv.textContent = (result.error || result.content?.[0]?.text || JSON.stringify(result));
        } else {
            outputDiv.classList.add('success');
            outputDiv.textContent = result.content?.[0]?.text || JSON.stringify(result, null, 2);
        }
    } catch (error) {
        outputDiv.style.display = 'block';
        outputDiv.classList.add('error');
        outputDiv.textContent = `Network Error: ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Execute Tool';
    }
}


async function toggleTool(name, isEnabled) {
    try {
        const response = await fetch(`/api/tools/${name}/toggle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isEnabled, profileId: activeProfileId })
        });

        if (!response.ok) throw new Error('Failed to toggle tool');

        // Refresh the UI by refetching everything to ensure state consistency
        fetchTools();

    } catch (error) {
        console.error(`Failed to toggle ${name}:`, error);
        alert(`Error toggling tool ${name}. Please try again.`);
        // Revert the checkbox visually
        fetchTools();
    }
}

function escapeHtml(unsafe) {
    return (unsafe || '').toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Human in the Loop (HITL) ---

async function toggleApproval(name, requiresApproval) {
    try {
        const response = await fetch(`/api/tools/${name}/approval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requiresApproval, profileId: activeProfileId })
        });
        if (!response.ok) throw new Error('Failed to toggle approval');
        fetchTools();
    } catch (error) {
        console.error(`Failed to toggle approval for ${name}:`, error);
        alert(`Error toggling approval for ${name}. Please try again.`);
        fetchTools();
    }
}

function toggleHitlPanel() {
    const panel = document.getElementById('hitl-panel');
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'flex';
        fetchPendingApprovals();
    } else {
        panel.style.display = 'none';
    }
}

async function fetchPendingApprovals() {
    try {
        const res = await fetch('/api/hitl/pending');
        const pending = await res.json();
        renderPendingApprovals(pending);
        updateHitlBadge(pending.length);
    } catch (e) {
        console.error('Failed to fetch pending approvals', e);
    }
}

function updateHitlBadge(count) {
    const badge = document.getElementById('hitl-badge');
    const bell = document.getElementById('hitl-bell-btn');
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
        bell.classList.add('has-pending');
    } else {
        badge.style.display = 'none';
        bell.classList.remove('has-pending');
    }
}

function renderPendingApprovals(pending) {
    const body = document.getElementById('hitl-panel-body');
    if (!pending || pending.length === 0) {
        body.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--text-secondary);">No pending approvals.</div>';
        return;
    }

    let html = '';
    pending.forEach(req => {
        const time = new Date(req.createdAt).toLocaleString();
        let argsDisplay;
        try {
            argsDisplay = JSON.stringify(req.args, null, 2);
        } catch (e) {
            argsDisplay = String(req.args);
        }

        html += `
            <div class="hitl-request-card">
                <div class="hitl-request-header">
                    <span class="hitl-request-tool">${escapeHtml(req.toolName)}</span>
                    <span class="hitl-request-profile">${escapeHtml(req.profileName)}</span>
                </div>
                <div class="hitl-request-args">${escapeHtml(argsDisplay)}</div>
                <div class="hitl-request-time">Requested: ${time}</div>
                <div class="hitl-request-actions">
                    <button class="hitl-approve-btn" onclick="approveRequest('${req.id}')">✓ Approve</button>
                    <button class="hitl-reject-btn" onclick="rejectRequest('${req.id}')">✕ Reject</button>
                </div>
            </div>
        `;
    });
    body.innerHTML = html;
}

async function approveRequest(id) {
    try {
        const res = await fetch(`/api/hitl/${id}/approve`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to approve');
        fetchPendingApprovals();
    } catch (e) {
        alert('Error approving request: ' + e.message);
    }
}

async function rejectRequest(id) {
    try {
        const res = await fetch(`/api/hitl/${id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Rejected by administrator' })
        });
        if (!res.ok) throw new Error('Failed to reject');
        fetchPendingApprovals();
    } catch (e) {
        alert('Error rejecting request: ' + e.message);
    }
}

function startHitlPolling() {
    if (hitlPollInterval) clearInterval(hitlPollInterval);
    hitlPollInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/hitl/pending');
            const pending = await res.json();
            updateHitlBadge(pending.length);
            // If panel is visible, refresh its content too
            const panel = document.getElementById('hitl-panel');
            if (panel.style.display === 'flex') {
                renderPendingApprovals(pending);
            }
        } catch (e) { /* silent */ }
    }, 3000);
}
