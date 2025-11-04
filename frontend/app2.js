class ZeroDowntimeHub {
    constructor() {
        this.API_BASE = '/api';
        this.token = localStorage.getItem('zdh_token');
        this.user = JSON.parse(localStorage.getItem('zdh_user') || 'null');
        this.init();
    }

    init() {
        if (this.token && this.user) {
            this.showApp();
        } else {
            this.showAuth();
        }
    }

    async apiCall(endpoint, options = {}) {
        const url = `${this.API_BASE}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
        }

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        console.log('Making API call to:', url, config);

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    // Authentication
    async login(email, password) {
        try {
            const data = await this.apiCall('/auth/login', {
                method: 'POST',
                body: { email, password }
            });

            this.token = data.token;
            this.user = data.user;

            localStorage.setItem('zdh_token', this.token);
            localStorage.setItem('zdh_user', JSON.stringify(this.user));

            this.showApp();
            this.showNotification('Login successful!', 'success');
        } catch (error) {
            this.showNotification('Login failed: ' + error.message, 'error');
        }
    }

    async register(username, email, password) {
        try {
            const data = await this.apiCall('/auth/register', {
                method: 'POST',
                body: { username, email, password }
            });

            this.token = data.token;
            this.user = data.user;

            localStorage.setItem('zdh_token', this.token);
            localStorage.setItem('zdh_user', JSON.stringify(this.user));

            this.showApp();
            this.showNotification('Registration successful!', 'success');
        } catch (error) {
            this.showNotification('Registration failed: ' + error.message, 'error');
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('zdh_token');
        localStorage.removeItem('zdh_user');
        this.showAuth();
    }

    // Apps management
    async getApps() {
    try {
        const apps = await this.apiCall('/apps');
        // Enhance apps with port information from their deployments
        const enhancedApps = await Promise.all(
            apps.map(async (app) => {
                try {
                    const deployments = await this.apiCall(`/apps/${app._id}/deployments`);
                    const latestDeployment = deployments[0];
                    if (latestDeployment && latestDeployment.port) {
                        app.port = latestDeployment.port;
                    }
                    return app;
                } catch (error) {
                    console.error(`Failed to get deployments for app ${app._id}:`, error);
                    return app;
                }
            })
        );
        return enhancedApps;
    } catch (error) {
        console.error('Failed to get apps:', error);
        return [];
    }
}

    async deleteApp(id) {
        return this.apiCall(`/apps/${id}`, {
            method: 'DELETE'
        });
    }

    // Deployments
    async getDeployments() {
        try {
            return await this.apiCall('/deployments');
        } catch (error) {
            console.error('Failed to get deployments:', error);
            return [];
        }
    }

    async createDeployment(appId) {
        return this.apiCall('/deployments', {
            method: 'POST',
            body: { appId }
        });
    }

    async getDeploymentLogs(id) {
        return this.apiCall(`/logs/deployment/${id}`);
    }

    // Tunnel Management
    async checkTunnelStatus(deploymentId) {
        try {
            const status = await this.apiCall(`/deployments/${deploymentId}/tunnel-status`);
            console.log('Tunnel status:', status);
            
            if (status.running) {
                this.showNotification(`✅ Tunnel is running: ${status.publicUrl}`, 'success');
                return status;
            } else {
                this.showNotification('⚠️ Tunnel is not running', 'warning');
                return status;
            }
        } catch (error) {
            console.error('Failed to check tunnel status:', error);
            return { running: false };
        }
    }

    async closeTunnel(deploymentId) {
        if (confirm('Are you sure you want to close the public tunnel?')) {
            try {
                const result = await this.apiCall(`/deployments/${deploymentId}/tunnel`, {
                    method: 'DELETE'
                });
                this.showNotification('✅ Tunnel closed successfully', 'success');
                this.loadDeployments();
                return result;
            } catch (error) {
                this.showNotification('Failed to close tunnel: ' + error.message, 'error');
            }
        }
    }

    // UI helpers
    showAuth() {
        this.hideAllPages();
        document.getElementById('login-page').classList.add('active');
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.style.display = 'none';
    }

    showApp() {
        this.hideAllPages();
        this.showPage('dashboard');
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.style.display = 'block';
    }

    hideAllPages() {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
    }

    showPage(pageName) {
        this.hideAllPages();
        const page = document.getElementById(`${pageName}-page`);
        if (page) page.classList.add('active');
        
        switch (pageName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'apps':
                this.loadApps();
                break;
            case 'deployments':
                this.loadDeployments();
                break;
            case 'profile':
                this.loadProfile();
                break;
        }
    }

    async loadDashboard() {
        try {
            const [apps, deployments] = await Promise.all([
                this.getApps(),
                this.getDeployments()
            ]);

            const totalAppsEl = document.getElementById('total-apps');
            const activeDeploymentsEl = document.getElementById('active-deployments');
            const successRateEl = document.getElementById('success-rate');
            const recentDeploymentsEl = document.getElementById('recent-deployments');

            if (totalAppsEl) totalAppsEl.textContent = apps.length;
            
            const activeDeployments = deployments.filter(d => 
                d.status === 'active' || d.status === 'deploying'
            ).length;
            if (activeDeploymentsEl) activeDeploymentsEl.textContent = activeDeployments;

            const successfulDeployments = deployments.filter(d => 
                d.status === 'active'
            ).length;
            const successRate = deployments.length > 0 
                ? Math.round((successfulDeployments / deployments.length) * 100)
                : 0;
            if (successRateEl) successRateEl.textContent = `${successRate}%`;

            const recentDeployments = deployments.slice(0, 5);
            const deploymentsHtml = recentDeployments.length > 0 
                ? this.renderDeploymentsTable(recentDeployments)
                : '<p>No deployments yet. <a href="#" onclick="showPage(\'apps\')">Deploy your first app</a>.</p>';
            if (recentDeploymentsEl) recentDeploymentsEl.innerHTML = deploymentsHtml;

        } catch (error) {
            this.showNotification('Failed to load dashboard data', 'error');
        }
    }

    async loadApps() {
        try {
            const apps = await this.getApps();
            console.log('Loaded apps:', apps);
            const appsListEl = document.getElementById('apps-list');
            if (appsListEl) {
                const appsHtml = apps.length > 0 
                    ? this.renderAppsList(apps)
                    : '<p>No applications yet. <a href="#" onclick="showCreateAppForm()">Deploy your first app</a>.</p>';
                appsListEl.innerHTML = appsHtml;
            }
        } catch (error) {
            this.showNotification('Failed to load applications', 'error');
        }
    }

    async loadDeployments() {
        try {
            const deployments = await this.getDeployments();
            const deploymentsListEl = document.getElementById('deployments-list');
            if (deploymentsListEl) {
                const deploymentsHtml = deployments.length > 0 
                    ? this.renderDeploymentsTable(deployments)
                    : '<p>No deployments yet.</p>';
                deploymentsListEl.innerHTML = deploymentsHtml;
            }
        } catch (error) {
            this.showNotification('Failed to load deployments', 'error');
        }
    }

    loadProfile() {
        if (this.user) {
            const profileInfoEl = document.getElementById('profile-info');
            if (profileInfoEl) {
                profileInfoEl.innerHTML = `
                    <p><strong>Username:</strong> ${this.user.username}</p>
                    <p><strong>Email:</strong> ${this.user.email}</p>
                    <p><strong>Member since:</strong> ${new Date().toLocaleDateString()}</p>
                `;
            }
        }
    }

    
    async setupWebhook(appId) {
        try {
            const result = await this.apiCall(`/apps/${appId}/webhook`, {
                method: 'POST'
            });
            
            this.showNotification('Webhook configured! GitHub will now trigger deployments automatically.', 'success');
            return result;
        } catch (error) {
            this.showNotification('Failed to setup webhook: ' + error.message, 'error');
        }
    }
    
    async blueGreenDeploy(appId) {
    try {
        this.showNotification('Starting Blue-Green deployment...', 'info');
        
        // FIX: Use the correct endpoint - /deployments/blue-green/{appId}
        const result = await this.apiCall(`/deployments/blue-green/${appId}`, {
            method: 'POST'
        });
        
        if (result.success) {
            this.showNotification('Blue-Green deployment started! Monitoring health checks...', 'success');
            
            // Validate deployment ID before monitoring
            const deploymentId = result.deployment?._id || result.deployment?.id;
            if (deploymentId && deploymentId !== 'undefined') {
                console.log('Monitoring Blue-Green deployment:', deploymentId);
                this.monitorBlueGreenDeployment(deploymentId);
            } else {
                throw new Error('No valid deployment ID returned');
            }
        } else {
            throw new Error(result.error || 'Blue-Green deployment failed');
        }
        
    } catch (error) {
        console.error('Blue-Green deployment error:', error);
        this.showNotification('Blue-Green deployment failed: ' + error.message, 'error');
    }
}
    
    async monitorBlueGreenDeployment(deploymentId) {
        const interval = setInterval(async () => {
            try {
                const deployment = await this.apiCall(`/deployments/${deploymentId}`);
                
                if (deployment.status === 'active') {
                    clearInterval(interval);
                    this.showNotification(
                        '✅ New version deployed successfully! Ready to switch traffic.', 
                        'success'
                    );
                    this.showTrafficSwitchModal(deploymentId);
                } else if (deployment.status === 'failed') {
                    clearInterval(interval);
                    this.showNotification('❌ Deployment failed', 'error');
                }
            } catch (error) {
                console.error('Error monitoring deployment:', error);
            }
        }, 3000);
    }
    
    async switchTraffic(deploymentId) {
        try {
            const result = await this.apiCall(`/deployments/${deploymentId}/switch-traffic`, {
                method: 'POST'
            });
            
            this.showNotification('✅ Traffic switched to new version! Zero downtime achieved.', 'success');
            this.loadApps();
            this.loadDeployments();
            
        } catch (error) {
            this.showNotification('Failed to switch traffic: ' + error.message, 'error');
        }
    }
    
    async rollback(deploymentId) {
        if (confirm('Are you sure you want to rollback to previous version?')) {
            try {
                const result = await this.apiCall(`/deployments/${deploymentId}/rollback`, {
                    method: 'POST'
                });
                
                this.showNotification('✅ Rollback completed successfully!', 'success');
                this.loadApps();
                this.loadDeployments();
                
            } catch (error) {
                this.showNotification('Rollback failed: ' + error.message, 'error');
            }
        }
    }
    
    showTrafficSwitchModal(deploymentId) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
        modal.innerHTML = `
            <div style="background:white;padding:2rem;border-radius:1rem;text-align:center;max-width:500px;">
                <h3>🚀 New Version Ready!</h3>
                <p>Health checks passed! The new version is running and ready.</p>
                <div style="background:var(--background);padding:1rem;border-radius:0.5rem;margin:1rem 0;">
                    <p><strong>Ready to switch traffic with zero downtime?</strong></p>
                </div>
                <div style="display:flex;gap:1rem;justify-content:center;">
                    <button class="btn btn-success" onclick="zdh.switchTraffic('${deploymentId}'); this.parentElement.parentElement.parentElement.remove();">
                        ✅ Switch Traffic Now
                    </button>
                    <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                        Switch Later
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Enhanced renderAppsList with CI/CD buttons
    renderAppsList(apps) {
        return `
            <div class="grid grid-cols-2">
                ${apps.map(app => {
                    const hasValidPort = app.port && !isNaN(app.port) && app.port > 0;
                    const displayUrl = app.publicUrl || (hasValidPort ? `http://localhost:${app.port}` : 'http://localhost:3004');
                    const isPublicUrl = !!app.publicUrl;
                    
                    return `
                        <div class="card app-card">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                                <div>
                                    <h3>${app.name}</h3>
                                    <p style="color: var(--secondary); margin-bottom: 0.5rem;">${app.description || 'No description'}</p>
                                    <p style="font-size: 0.875rem; color: var(--secondary);">
                                        GitHub: ${app.githubUrl}
                                    </p>
                                    ${app.publicUrl ? `
                                        <p style="font-size: 0.875rem; color: var(--success); margin-top: 0.5rem;">
                                            <strong>Live URL:</strong> <a href="${app.publicUrl}" target="_blank">${app.publicUrl}</a>
                                        </p>
                                    ` : `
                                        <p style="font-size: 0.875rem; color: var(--warning); margin-top: 0.5rem;">
                                            <strong>Local URL:</strong> ${displayUrl}
                                        </p>
                                    `}
                                    ${app.webhookConfigured ? `
                                        <p style="font-size: 0.875rem; color: var(--success); margin-top: 0.5rem;">
                                            ✅ CI/CD Enabled (GitHub Webhook)
                                        </p>
                                    ` : ''}
                                </div>
                                <span class="status-badge status-${app.status}">
                                    ${app.status}
                                </span>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button class="btn btn-primary" onclick="zdh.deployApp('${app._id}', '${app.name}')">
                                    Deploy New Version
                                </button>
                                
                                <button class="btn btn-warning" onclick="zdh.blueGreenDeploy('${app._id}')">
                                    🔄 Blue-Green Deploy
                                </button>
                                
                                ${!app.webhookConfigured ? `
                                    <button class="btn btn-info" onclick="zdh.setupWebhook('${app._id}')">
                                        ⚙️ Setup CI/CD
                                    </button>
                                ` : ''}
                                
                                <!-- ALWAYS VISIBLE View App Button -->
                                <button class="btn view-app-btn" onclick="window.open('${displayUrl}', '_blank')">
                                    ${isPublicUrl ? '🌐 View Live App' : '🔒 View Local App'}
                                </button>
                                
                                ${app.publicUrl ? `
                                    <button class="btn btn-info" onclick="zdh.showQRCode('${app.publicUrl}')">
                                        Show QR Code
                                    </button>
                                ` : ''}
                                
                                <button class="btn btn-secondary" onclick="zdh.viewAppLogs('${app._id}')">
                                    View Logs
                                </button>
                                <button class="btn btn-danger" onclick="zdh.deleteApp('${app._id}')">
                                    Delete
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }


//     // Render methods
//     renderAppsList(apps) {
//     return `
//         <div class="grid grid-cols-2">
//             ${apps.map(app => {
//                 // Determine the URL to use - public URL if available, otherwise localhost
//                 const displayUrl = app.publicUrl || `http://localhost:3004`;
//                 const isPublicUrl = !!app.publicUrl;
                
//                 return `
//                     <div class="card app-card">
//                         <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
//                             <div>
//                                 <h3>${app.name}</h3>
//                                 <p style="color: var(--secondary); margin-bottom: 0.5rem;">${app.description || 'No description'}</p>
//                                 <p style="font-size: 0.875rem; color: var(--secondary);">
//                                     GitHub: ${app.githubUrl}
//                                 </p>
//                                 ${app.publicUrl ? `
//                                     <p style="font-size: 0.875rem; color: var(--success); margin-top: 0.5rem;">
//                                         <strong>Live URL:</strong> <a href="${app.publicUrl}" target="_blank">${app.publicUrl}</a>
//                                     </p>
//                                 ` : `
//                                     <p style="font-size: 0.875rem; color: var(--warning); margin-top: 0.5rem;">
//                                         <strong>Local URL:</strong> ${displayUrl}
//                                     </p>
//                                 `}
//                             </div>
//                             <span class="status-badge status-${app.status}">
//                                 ${app.status}
//                             </span>
//                         </div>
//                         <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
//                             <button class="btn btn-primary" onclick="zdh.deployApp('${app._id}', '${app.name}')">
//                                 Deploy New Version
//                             </button>
                            
//                             <!-- ALWAYS VISIBLE View App Button -->
//                             <button class="btn view-app-btn" onclick="window.open('${displayUrl}', '_blank')">
//                                 ${isPublicUrl ? '🌐 View Live App' : '🔒 View Local App'}
//                             </button>
                            
//                             ${app.publicUrl ? `
//                                 <button class="btn btn-info" onclick="zdh.showQRCode('${app.publicUrl}')">
//                                     Show QR Code
//                                 </button>
//                             ` : ''}
                            
//                             <button class="btn btn-secondary" onclick="zdh.viewAppLogs('${app._id}')">
//                                 View Logs
//                             </button>
//                             <button class="btn btn-danger" onclick="zdh.deleteApp('${app._id}')">
//                                 Delete
//                             </button>
//                         </div>
//                     </div>
//                 `;
//             }).join('')}
//         </div>
//     `;
// }

   // In your frontend JavaScript - enhance the deployment table and actions

renderDeploymentsTable(deployments) {
    return `
        <table class="table">
            <thead>
                <tr>
                    <th>App</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Public URL</th>
                    <th>Tunnel Status</th>
                    <th>Started</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${deployments.map(deployment => `
                    <tr>
                        <td>${deployment.appId?.name || 'Unknown'}</td>
                        <td>${deployment.version}</td>
                        <td>
                            <span class="status-badge status-${deployment.status}">
                                ${deployment.status}
                            </span>
                        </td>
                        <td>
                            ${deployment.publicUrl ? `
                                <div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
                                    <a href="${deployment.publicUrl}" target="_blank" 
                                       style="font-size: 0.875rem; color: var(--success);" 
                                       title="${deployment.publicUrl}">
                                        ${this.shortenUrl(deployment.publicUrl)}
                                    </a>
                                </div>
                            ` : 'No public URL'}
                        </td>
                        <td>
                            ${deployment.tunnelPid ? `
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span class="status-badge status-active">🟢 Running</span>
                                    <small title="PID: ${deployment.tunnelPid}">PID:${deployment.tunnelPid}</small>
                                </div>
                            ` : deployment.publicUrl && deployment.publicUrl.includes('localhost') ? 
                                '<span class="status-badge status-inactive">🔴 Local Only</span>' :
                                '<span class="status-badge status-inactive">⚪ No Tunnel</span>'}
                        </td>
                        <td>${new Date(deployment.startedAt).toLocaleString()}</td>
                        <td>
                            <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                                <button class="btn btn-secondary" onclick="zdh.viewDeploymentLogs('${deployment._id}')">
                                    📋 Logs
                                </button>
                                ${deployment.publicUrl ? `
                                    <button class="btn view-app-btn" 
                                            onclick="zdh.openAppUrl('${deployment.publicUrl}')"
                                            title="Open ${deployment.publicUrl}">
                                        🌐 View Live
                                    </button>
                                    ${deployment.qrCode ? `
                                        <button class="btn btn-info" 
                                                onclick="zdh.showQRCode('${deployment.publicUrl}', '${deployment.qrCode}')">
                                            📱 QR Code
                                        </button>
                                    ` : ''}
                                ` : ''}
                                ${deployment.tunnelPid ? `
                                    <button class="btn btn-warning" 
                                            onclick="zdh.closeTunnel('${deployment._id}')"
                                            title="Close public tunnel">
                                        🔌 Close Tunnel
                                    </button>
                                    <button class="btn btn-info" 
                                            onclick="zdh.checkTunnelStatus('${deployment._id}')">
                                        🔄 Status
                                    </button>
                                ` : deployment.status === 'active' ? `
                                    <button class="btn btn-primary" 
                                            onclick="zdh.createTunnel('${deployment._id}')"
                                            title="Create public URL">
                                        🌐 Create Tunnel
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// New method to shorten URLs for display
shortenUrl(url) {
    if (url.length > 30) {
        return url.substring(0, 27) + '...';
    }
    return url;
}

// Enhanced tunnel methods in ZeroDowntimeHub class
async createTunnel(deploymentId) {
    try {
        this.showNotification('Creating public tunnel...', 'info');
        
        const result = await this.apiCall(`/deployments/${deploymentId}/create-tunnel`, {
            method: 'POST'
        });
        
        if (result.success) {
            this.showNotification(`✅ Tunnel created: ${result.publicUrl}`, 'success');
            this.loadDeployments();
            
            // Auto-open the URL after creation
            setTimeout(() => {
                this.openAppUrl(result.publicUrl);
            }, 1000);
        } else {
            this.showNotification('Failed to create tunnel: ' + result.error, 'error');
        }
    } catch (error) {
        this.showNotification('Failed to create tunnel: ' + error.message, 'error');
    }
}

// Enhanced method to open app URLs without password prompts
openAppUrl(url) {
    console.log('🌐 Opening app URL:', url);
    
    // Create a hidden iframe to handle any authentication
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    
    // Also open in new tab
    setTimeout(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
    }, 500);
    
    // Clean up iframe after a delay
    setTimeout(() => {
        if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }
    }, 3000);
}

// Enhanced tunnel status check
async checkTunnelStatus(deploymentId) {
    try {
        const status = await this.apiCall(`/deployments/${deploymentId}/tunnel-status`);
        
        if (status.running) {
            this.showNotification(
                `🟢 Tunnel is running\nURL: ${status.publicUrl}\nPID: ${status.pid}`, 
                'success'
            );
        } else if (status.exists) {
            this.showNotification('🔴 Tunnel exists but is not running', 'warning');
        } else {
            this.showNotification('⚪ No tunnel found for this deployment', 'info');
        }
        
        return status;
    } catch (error) {
        this.showNotification('Failed to check tunnel status: ' + error.message, 'error');
        return { running: false };
    }
}

    // App actions
    async deployApp(appId, appName) {
        try {
            this.showDeployModal(appName);
            const result = await this.createDeployment(appId);
            this.showNotification('Deployment started!', 'success');
            
            // Poll for deployment status
            this.pollDeploymentStatus(result.deployment._id || result.deployment.id);
            
        } catch (error) {
            this.showNotification('Failed to start deployment: ' + error.message, 'error');
            this.hideDeployModal();
        }
    }

    async pollDeploymentStatus(deploymentId) {
        const interval = setInterval(async () => {
            try {
                const deployment = await this.apiCall(`/deployments/${deploymentId}`);
                const logs = await this.getDeploymentLogs(deploymentId);
                
                const logsContent = document.getElementById('deploy-logs-content');
                if (logsContent) logsContent.textContent = logs.logs || 'No logs available';
                
                if (deployment.status !== 'building' && deployment.status !== 'deploying') {
                    clearInterval(interval);
                    if (deployment.status === 'active') {
                        this.showNotification('Deployment completed successfully!', 'success');
                        // Show QR code if available
                        if (deployment.qrCode) {
                            this.showQRCode(deployment.publicUrl, deployment.qrCode);
                        }
                    } else {
                        this.showNotification('Deployment failed', 'error');
                    }
                    setTimeout(() => {
                        this.hideDeployModal();
                        this.loadApps();
                        this.loadDeployments();
                    }, 2000);
                }
            } catch (error) {
                clearInterval(interval);
                this.showNotification('Error checking deployment status: ' + error.message, 'error');
                this.hideDeployModal();
            }
        }, 2000);
    }

    // Delete app handler
    async deleteApp(appId) {
        if (confirm('Are you sure you want to delete this app? All deployments will be removed.')) {
            try {
                await this.apiCall(`/apps/${appId}`, { method: 'DELETE' });
                this.showNotification('App deleted successfully', 'success');
                this.loadApps();
            } catch (error) {
                this.showNotification('Failed to delete app: ' + error.message, 'error');
            }
        }
    }

    viewApp(subdomain) {
        const url = `http://${subdomain}.localhost`;
        console.log('Opening app URL:', url);
        window.open(url, '_blank');
    }

    async viewDeploymentLogs(deploymentId) {
        try {
            const logs = await this.getDeploymentLogs(deploymentId);
            this.showLogsModal(logs.logs || 'No logs available');
        } catch (error) {
            this.showNotification('Failed to load logs: ' + error.message, 'error');
        }
    }

    async viewAppLogs(appId) {
        try {
            const deployments = await this.getDeployments();
            const appDeployments = deployments.filter(d => d.appId?._id === appId || d.appId?.id === appId);
            if (appDeployments.length > 0) {
                this.viewDeploymentLogs(appDeployments[0]._id || appDeployments[0].id);
            } else {
                this.showNotification('No deployments found for this app', 'error');
            }
        } catch (error) {
            this.showNotification('No deployments found for this app', 'error');
        }
    }

    // QR Code Modal
    showQRCode(url, qrCodeUrl = null) {
        if (!qrCodeUrl) {
            qrCodeUrl = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(url)}`;
        }
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
        modal.innerHTML = `
            <div style="background:white;padding:2rem;border-radius:1rem;text-align:center;max-width:90vw;">
                <h3>Scan QR Code to Access App</h3>
                <img src="${qrCodeUrl}" alt="QR Code" style="width:200px;height:200px;border:1px solid #ccc;">
                <p style="margin:1rem 0;word-break:break-all;font-family:monospace;">${url}</p>
                <div style="display:flex;gap:1rem;justify-content:center;">
                    <button class="btn btn-primary" onclick="window.open('${url}', '_blank')">Open App</button>
                    <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Modal controls
    showLogsModal(logs) {
        const logsContent = document.getElementById('logs-content');
        const logsModal = document.getElementById('logs-modal');
        if (logsContent) logsContent.textContent = logs;
        if (logsModal) logsModal.style.display = 'flex';
    }

    hideLogsModal() {
        const logsModal = document.getElementById('logs-modal');
        if (logsModal) logsModal.style.display = 'none';
    }

    showDeployModal(appName) {
        const deployModalTitle = document.getElementById('deploy-modal-title');
        const deployLogsContent = document.getElementById('deploy-logs-content');
        const deployModal = document.getElementById('deploy-modal');
        
        if (deployModalTitle) deployModalTitle.textContent = `Deploying ${appName}`;
        if (deployLogsContent) deployLogsContent.textContent = 'Starting deployment...';
        if (deployModal) deployModal.style.display = 'flex';
    }

    hideDeployModal() {
        const deployModal = document.getElementById('deploy-modal');
        if (deployModal) deployModal.style.display = 'none';
    }

    showCreateAppForm() {
        const form = document.getElementById('create-app-form');
        if (form) form.style.display = 'block';
    }

    hideCreateAppForm() {
        const form = document.getElementById('create-app-form');
        if (form) form.style.display = 'none';
        
        // Reset form
        const appName = document.getElementById('app-name');
        const appDescription = document.getElementById('app-description');
        const appGithubUrl = document.getElementById('app-github-url');
        const appBuildCommand = document.getElementById('app-build-command');
        const appStartCommand = document.getElementById('app-start-command');
        
        if (appName) appName.value = '';
        if (appDescription) appDescription.value = '';
        if (appGithubUrl) appGithubUrl.value = '';
        if (appBuildCommand) appBuildCommand.value = '';
        if (appStartCommand) appStartCommand.value = '';
    }

    // Create app handler
    async handleCreateApp(event) {
        event.preventDefault();
        console.log('Creating app...');
        const enableWebhook = document.getElementById('enable-webhook').checked;
        
        const appData = {
            name: document.getElementById('app-name').value,
            description: document.getElementById('app-description').value,
            githubUrl: document.getElementById('app-github-url').value,
            buildCommand: document.getElementById('app-build-command').value || undefined,
            startCommand: document.getElementById('app-start-command').value || undefined,
            enableWebhook: enableWebhook
        };

        console.log('App data:', appData);

        try {
            const result = await this.apiCall('/apps', {
                method: 'POST',
                body: appData
            });
            
            console.log('App creation result:', result);
            
            this.showNotification('App created successfully! Starting deployment...', 'success');
            this.hideCreateAppForm();
            this.loadApps();
            
            // Auto-deploy the new app
            setTimeout(() => {
                const appId = result.app?._id || result.app?.id || result._id;
                if (appId) {
                    this.deployApp(appId, result.app?.name || appData.name);
                } else {
                    this.showNotification('App created but could not start deployment: No app ID returned', 'error');
                }
            }, 1000);
            
        } catch (error) {
            console.error('App creation failed:', error);
            this.showNotification('Failed to create app: ' + error.message, 'error');
        }
        
        return false;
    }

    // Notification helpers
    showNotification(message, type = 'info') {
        // Simple notification - you can enhance this with a proper notification system
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

// Global functions for HTML onclick handlers
function showAuthForm(type) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authForms = document.getElementById('auth-forms');
    
    if (loginForm) loginForm.style.display = type === 'login' ? 'block' : 'none';
    if (registerForm) registerForm.style.display = type === 'register' ? 'block' : 'none';
    if (authForms) authForms.style.display = 'block';
}

function showPage(pageName) {
    zdh.showPage(pageName);
}

function showCreateAppForm() {
    zdh.showCreateAppForm();
}

function hideCreateAppForm() {
    zdh.hideCreateAppForm();
}

function hideLogsModal() {
    zdh.hideLogsModal();
}

function hideDeployModal() {
    zdh.hideDeployModal();
}

function login(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    zdh.login(email, password);
}

function register(event) {
    event.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    zdh.register(username, email, password);
}

function logout() {
    zdh.logout();
}

function submitCreateAppForm(event) {
    return zdh.handleCreateApp(event);
}

// Initialize app
const zdh = new ZeroDowntimeHub();