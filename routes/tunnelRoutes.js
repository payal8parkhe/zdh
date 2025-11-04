// routes/tunnelRoutes.js
const express = require('express');
const router = express.Router();
const tunnelService = require('../services/EnhancedBackgroundTunnelService');

// Create tunnel for deployment
// router.post('/deployments/:id/tunnel', async (req, res) => {
//     try {
//         const deployment = await getDeploymentById(req.params.id);
//         if (!deployment) {
//             return res.status(404).json({ error: 'Deployment not found' });
//         }

//         // FIX: Ensure port is a NUMBER, not string
//         const port = parseInt(deployment.port);
//         if (isNaN(port)) {
//             return res.status(400).json({ 
//                 success: false, 
//                 error: `Invalid port: ${deployment.port}` 
//             });
//         }

//         console.log(`Creating tunnel for deployment ${req.params.id} on port ${port}`);

//         // FIX: Call with correct parameters - appId, appName, localPort
//         const tunnelResult = await tunnelService.createTunnelForApp(
//             req.params.id,           // appId (use deployment ID)
//             deployment.appId?.name || 'Unknown App', // appName
//             port                     // localPort (must be number)
//         );

//         // Update deployment with tunnel info
//         await updateDeployment(req.params.id, {
//             publicUrl: tunnelResult.publicUrl,
//             qrCode: tunnelResult.qrCode,
//             tunnelPid: tunnelResult.pid,
//             tunnelMethod: tunnelResult.method,
//             tunnelStatus: tunnelResult.success ? 'active' : 'failed'
//         });

//         res.json({
//             success: tunnelResult.success,
//             publicUrl: tunnelResult.publicUrl,
//             qrCode: tunnelResult.qrCode,
//             pid: tunnelResult.pid,
//             method: tunnelResult.method,
//             message: tunnelResult.success ? 'Tunnel created successfully' : tunnelResult.error
//         });

//     } catch (error) {
//         console.error('Tunnel creation error:', error);
//         res.status(500).json({ 
//             success: false, 
//             error: error.message 
//         });
//     }
// });

// In your tunnel route - ADD THIS DELAY
router.post('/deployments/:id/tunnel', async (req, res) => {
    try {
        const deployment = await getDeploymentById(req.params.id);
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }

        const port = parseInt(deployment.port);
        if (isNaN(port)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid port: ${deployment.port}` 
            });
        }

        console.log(`Creating tunnel for deployment ${req.params.id} on port ${port}`);

        // WAIT for container to be fully ready (important!)
        console.log('⏳ Waiting for container to be ready...');
        await new Promise(resolve => setTimeout(resolve, 8000));

        const tunnelResult = await tunnelService.createTunnelForApp(
            req.params.id,
            deployment.appId?.name || 'Unknown App',
            port
        );

        // Update deployment with tunnel info
        await updateDeployment(req.params.id, {
            publicUrl: tunnelResult.publicUrl,
            qrCode: tunnelResult.qrCode,
            tunnelPid: tunnelResult.pid,
            tunnelMethod: tunnelResult.method,
            tunnelStatus: tunnelResult.success ? 'active' : 'failed',
            lastTunnelCheck: new Date()
        });

        console.log(`📦 Tunnel result:`, {
            success: tunnelResult.success,
            url: tunnelResult.publicUrl,
            method: tunnelResult.method
        });

        res.json({
            success: tunnelResult.success,
            publicUrl: tunnelResult.publicUrl,
            qrCode: tunnelResult.qrCode,
            pid: tunnelResult.pid,
            method: tunnelResult.method,
            message: tunnelResult.success ? 'Tunnel created successfully' : tunnelResult.error
        });

    } catch (error) {
        console.error('Tunnel creation error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
// Get tunnel status
router.get('/deployments/:id/tunnel-status', async (req, res) => {
    try {
        const status = tunnelService.getTunnelStatus(req.params.id);
        
        // Also check deployment status in database
        const deployment = await getDeploymentById(req.params.id);
        if (deployment && deployment.publicUrl) {
            status.publicUrl = deployment.publicUrl;
            status.qrCode = deployment.qrCode;
            status.method = deployment.tunnelMethod;
        }
        
        res.json(status);
    } catch (error) {
        res.status(500).json({ 
            running: false, 
            error: error.message 
        });
    }
});

// Close tunnel
router.delete('/deployments/:id/tunnel', async (req, res) => {
    try {
        const result = await tunnelService.closeTunnelForApp(req.params.id);
        
        if (result.success) {
            // Update deployment
            await updateDeployment(req.params.id, {
                publicUrl: null,
                qrCode: null,
                tunnelPid: null,
                tunnelMethod: null,
                tunnelStatus: 'closed'
            });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// List all active tunnels (admin endpoint)
router.get('/admin/tunnels', async (req, res) => {
    try {
        const tunnels = tunnelService.getAllActiveTunnels();
        res.json({ 
            success: true,
            count: tunnels.length,
            tunnels 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Test tunnel service
router.post('/test-tunnel', async (req, res) => {
    try {
        const { port = 3000 } = req.body;
        
        const testResult = await tunnelService.createTunnelForApp(
            'test-' + Date.now(),
            'Test App',
            parseInt(port)
        );
        
        res.json(testResult);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;
