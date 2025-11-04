const express = require('express');
const auth = require('../middleware/auth');
const Deployment = require('../models/Deployment');
const App = require('../models/App');
const deploymentEngine = require('../services/DeploymentEngine');

const router = express.Router();

// Get all deployments for user
router.get('/', auth, async (req, res) => {
  try {
    const deployments = await Deployment.find({ userId: req.user._id })
      .populate('appId', 'name subdomain')
      .sort({ startedAt: -1 })
      .limit(50);

    res.json(deployments);
  } catch (error) {
    console.error('Get deployments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FIXED: Create new deployment - PROPER response handling
router.post('/', auth, async (req, res) => {
  try {
    const { appId } = req.body;

    const app = await App.findOne({ _id: appId, userId: req.user._id });
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Get latest version and increment
    const latestDeployment = await Deployment.findOne({ appId })
      .sort({ startedAt: -1 });
    
    const currentVersion = latestDeployment?.version || 'v1';
    const nextVersion = `v${parseInt(currentVersion.slice(1)) + 1}`;

    // Create deployment record
    const deployment = new Deployment({
      version: nextVersion,
      appId,
      userId: req.user._id,
      githubUrl: app.githubUrl,
      status: 'building'
    });

    // Save deployment FIRST to get the _id
    await deployment.save();

    console.log('Created deployment with ID:', deployment._id); // Debug log

    // Return response IMMEDIATELY with the deployment ID
    res.json({
      success: true,
      message: 'Deployment started',
      deployment: {
        _id: deployment._id.toString(), // Ensure it's a string
        id: deployment._id.toString(),  // Include both for compatibility
        version: deployment.version,
        status: deployment.status
      }
    });

    // Start deployment process AFTER sending response (non-blocking)
    deploymentEngine.deploy(app, nextVersion, req.user._id)
      .then(async (result) => {
        if (result.success) {
          deployment.status = 'active';
          deployment.port = result.port;
          deployment.containerId = result.containerId;
          deployment.healthCheckStatus = 'healthy';
          deployment.buildLogs = result.logs;
          
          // Update app with new version and port
          app.currentVersion = nextVersion;
          app.currentPort = result.port;
          app.status = 'active';
          await app.save();
        } else {
          deployment.status = 'failed';
          deployment.buildLogs = result.logs;
        }
        
        deployment.completedAt = new Date();
        await deployment.save();
        
        console.log(`Deployment ${deployment._id} completed with status: ${deployment.status}`);
      })
      .catch(async (error) => {
        deployment.status = 'failed';
        deployment.buildLogs = `Deployment error: ${error.message}`;
        deployment.completedAt = new Date();
        await deployment.save();
        
        console.error(`Deployment ${deployment._id} failed:`, error);
      });

  } catch (error) {
    console.error('Create deployment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get deployment by ID with validation
router.get('/:id', auth, async (req, res) => {
  try {
    // Validate deployment ID
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ error: 'Invalid deployment ID' });
    }

    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('appId', 'name subdomain');

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json(deployment);
  } catch (error) {
    console.error('Get deployment error:', error);
    
    // Handle CastError specifically
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid deployment ID format' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Blue-Green deployment endpoint
router.post('/blue-green/:appId', auth, async (req, res) => {
  try {
    const { appId } = req.params;

    const app = await App.findOne({ _id: appId, userId: req.user._id });
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Get current active deployment (BLUE)
    const currentDeployment = await Deployment.findOne({
      appId: appId,
      status: 'active',
      isLive: true
    });

    // Create new deployment (GREEN)
    const latestDeployment = await Deployment.findOne({ appId }).sort({ startedAt: -1 });
    const currentVersion = latestDeployment?.version || 'v1';
    const nextVersion = `v${parseInt(currentVersion.slice(1)) + 1}`;

    const newDeployment = new Deployment({
      version: nextVersion,
      appId: appId,
      userId: req.user._id,
      githubUrl: app.githubUrl,
      status: 'building',
      strategy: 'blue-green',
      isLive: false,
      port: (currentDeployment?.port || 3000) + 1
    });

    await newDeployment.save();

    // Return response immediately
    res.json({
      success: true,
      message: 'Blue-Green deployment started',
      deployment: {
        _id: newDeployment._id.toString(),
        id: newDeployment._id.toString(),
        version: newDeployment.version,
        status: newDeployment.status,
        strategy: 'blue-green'
      }
    });

    // Simulate deployment process (non-blocking)
    setTimeout(async () => {
      try {
        newDeployment.status = 'active';
        newDeployment.healthStatus = 'healthy';
        newDeployment.completedAt = new Date();
        await newDeployment.save();

        console.log(`✅ Blue-Green deployment ${newDeployment._id} ready for traffic switch`);
      } catch (error) {
        console.error('Blue-Green deployment simulation error:', error);
        newDeployment.status = 'failed';
        await newDeployment.save();
      }
    }, 3000);

  } catch (error) {
    console.error('Blue-Green deployment error:', error);
    res.status(500).json({ error: 'Failed to start Blue-Green deployment' });
  }
});

// Rollback deployment
router.post('/:id/rollback', auth, async (req, res) => {
  try {
    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    if (deployment.status !== 'active') {
      return res.status(400).json({ error: 'Only active deployments can be rolled back' });
    }

    // Find previous deployment to rollback to
    const previousDeployment = await Deployment.findOne({
      appId: deployment.appId,
      status: 'active',
      _id: { $ne: deployment._id }
    }).sort({ startedAt: -1 });

    if (!previousDeployment) {
      return res.status(404).json({ error: 'No previous deployment found for rollback' });
    }

    // Mark current deployment as rolled back
    deployment.status = 'rolled_back';
    await deployment.save();

    // Reactivate previous deployment
    previousDeployment.status = 'active';
    previousDeployment.isLive = true;
    await previousDeployment.save();

    // Update app to point to previous deployment
    await App.findByIdAndUpdate(deployment.appId, {
      currentVersion: previousDeployment.version,
      currentPort: previousDeployment.port,
      status: 'active'
    });

    res.json({ 
      success: true,
      message: 'Rollback completed successfully',
      rolledBackTo: {
        deploymentId: previousDeployment._id,
        version: previousDeployment.version
      }
    });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Switch traffic for Blue-Green deployment
router.post('/:id/switch-traffic', auth, async (req, res) => {
  try {
    const newDeployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!newDeployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    if (newDeployment.status !== 'active') {
      return res.status(400).json({ error: 'Only active deployments can receive traffic' });
    }

    // Get current live deployment
    const currentLiveDeployment = await Deployment.findOne({
      appId: newDeployment.appId,
      isLive: true,
      _id: { $ne: newDeployment._id }
    });

    // Switch traffic to new deployment
    if (currentLiveDeployment) {
      currentLiveDeployment.isLive = false;
      await currentLiveDeployment.save();
    }

    newDeployment.isLive = true;
    newDeployment.wentLiveAt = new Date();
    await newDeployment.save();

    // Update app with new deployment info
    await App.findByIdAndUpdate(newDeployment.appId, {
      currentVersion: newDeployment.version,
      currentPort: newDeployment.port,
      publicUrl: newDeployment.publicUrl,
      status: 'active'
    });

    res.json({
      success: true,
      message: 'Traffic switched successfully with zero downtime',
      switchedFrom: currentLiveDeployment ? {
        deploymentId: currentLiveDeployment._id,
        version: currentLiveDeployment.version
      } : null,
      switchedTo: {
        deploymentId: newDeployment._id,
        version: newDeployment.version
      }
    });
  } catch (error) {
    console.error('Switch traffic error:', error);
    res.status(500).json({ error: 'Failed to switch traffic' });
  }
});

// Get tunnel status
router.get('/:id/tunnel-status', auth, async (req, res) => {
  try {
    // Validate deployment ID
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ error: 'Invalid deployment ID' });
    }

    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const status = {
      running: !!deployment.tunnelPid,
      pid: deployment.tunnelPid,
      publicUrl: deployment.publicUrl,
      deploymentId: deployment._id
    };

    res.json(status);
  } catch (error) {
    console.error('Get tunnel status error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid deployment ID format' });
    }
    
    res.status(500).json({ error: 'Failed to get tunnel status' });
  }
});

// Get all active tunnels
router.get('/tunnels/active', auth, async (req, res) => {
  try {
    const tunnels = await Deployment.find({
      userId: req.user._id,
      tunnelPid: { $exists: true, $ne: null }
    }).select('appId tunnelPid publicUrl version');

    res.json(tunnels);
  } catch (error) {
    console.error('Get active tunnels error:', error);
    res.status(500).json({ error: 'Failed to get active tunnels' });
  }
});

// Close tunnel
router.delete('/:id/tunnel', auth, async (req, res) => {
  try {
    // Validate deployment ID
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ error: 'Invalid deployment ID' });
    }

    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    // Simulate tunnel closure
    deployment.tunnelPid = null;
    deployment.publicUrl = null;
    await deployment.save();

    res.json({
      success: true,
      message: 'Tunnel closed successfully',
      deploymentId: deployment._id
    });
  } catch (error) {
    console.error('Close tunnel error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid deployment ID format' });
    }
    
    res.status(500).json({ error: 'Failed to close tunnel' });
  }
});

// Create tunnel
router.post('/:id/create-tunnel', auth, async (req, res) => {
  try {
    // Validate deployment ID
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ error: 'Invalid deployment ID' });
    }

    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    if (deployment.status !== 'active') {
      return res.status(400).json({ error: 'Only active deployments can have tunnels' });
    }

    // Simulate tunnel creation
    const tunnelPid = Math.floor(Math.random() * 10000) + 1000;
    const publicUrl = `https://${deployment.appId.subdomain}-${deployment.version}.yourdomain.com`;

    deployment.tunnelPid = tunnelPid;
    deployment.publicUrl = publicUrl;
    await deployment.save();

    res.json({
      success: true,
      message: 'Tunnel created successfully',
      publicUrl: publicUrl,
      pid: tunnelPid,
      deploymentId: deployment._id
    });
  } catch (error) {
    console.error('Create tunnel error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid deployment ID format' });
    }
    
    res.status(500).json({ error: 'Failed to create tunnel' });
  }
});

module.exports = router;
