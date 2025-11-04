const express = require('express');
const auth = require('../middleware/auth');
const App = require('../models/App');
const Deployment = require('../models/Deployment');
const { body, validationResult } = require('express-validator');
const PollingService = require('../services/PollingService');

const router = express.Router();

// Get all apps for user
router.get('/', auth, async (req, res) => {
  try {
    const apps = await App.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new app - UPDATED VALIDATION
router.post('/', [
  auth,
  body('name').notEmpty().withMessage('App name is required'),
  body('githubUrl').isURL().withMessage('Valid GitHub URL is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, githubUrl, buildCommand, startCommand, enableWebhook } = req.body;

    // Validate GitHub URL format
    if (!githubUrl.includes('github.com')) {
      return res.status(400).json({ error: 'Please provide a valid GitHub repository URL' });
    }

    // Generate unique subdomain
    const baseSubdomain = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let subdomain = baseSubdomain;
    let counter = 1;

    while (await App.findOne({ subdomain })) {
      subdomain = `${baseSubdomain}-${counter}`;
      counter++;
    }

    const app = new App({
      name,
      description,
      githubUrl,
      buildCommand,
      startCommand,
      subdomain,
      userId: req.user._id,
      webhookConfigured: enableWebhook || false
    });

    await app.save();

    res.status(201).json({
      message: 'App created successfully',
      app: {
        id: app._id,
        name: app.name,
        subdomain: app.subdomain,
        status: app.status,
        webhookConfigured: app.webhookConfigured
      }
    });
  } catch (error) {
    console.error('Create app error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get app by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const app = await App.findOne({ _id: req.params.id, userId: req.user._id });
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }
    res.json(app);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete app
router.delete('/:id', auth, async (req, res) => {
  try {
    const app = await App.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }
    res.json({ message: 'App deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Setup webhook for CI/CD - NEW ROUTE
router.post('/:id/webhook', auth, async (req, res) => {
  try {
    const app = await App.findOne({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Generate webhook URL for GitHub
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const webhookUrl = `${baseUrl}/api/webhooks/github`;
    
    // Mark the app as having webhook configured
    app.webhookConfigured = true;
    app.webhookUrl = webhookUrl;
    await app.save();

    res.json({
      success: true,
      webhookUrl: webhookUrl,
      message: 'Webhook configured successfully. Add this URL to your GitHub repository webhooks.',
      setupInstructions: [
        '1. Go to your GitHub repository',
        '2. Navigate to Settings → Webhooks → Add webhook',
        `3. Set Payload URL to: ${webhookUrl}`,
        '4. Set Content type to: application/json',
        '5. Select "Just the push event"',
        '6. Click "Add webhook"'
      ].join('\n')
    });
  } catch (error) {
    console.error('Webhook setup error:', error);
    res.status(500).json({ error: 'Failed to setup webhook' });
  }
});

// Blue-Green deployment - NEW ROUTE
router.post('/:id/blue-green-deploy', auth, async (req, res) => {
  try {
    const app = await App.findOne({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Get latest version and increment
    const latestDeployment = await Deployment.findOne({ appId: app._id })
      .sort({ startedAt: -1 });
    
    const currentVersion = latestDeployment?.version || 'v1';
    const nextVersion = `v${parseInt(currentVersion.slice(1)) + 1}`;

    // Create deployment record for Blue-Green
    const deployment = new Deployment({
      version: nextVersion,
      appId: app._id,
      userId: req.user._id,
      githubUrl: app.githubUrl,
      status: 'building',
      strategy: 'blue-green',
      isLive: false
    });

    await deployment.save();

    // Start Blue-Green deployment process (non-blocking)
    setTimeout(async () => {
      try {
        deployment.status = 'active';
        deployment.healthStatus = 'healthy';
        deployment.completedAt = new Date();
        
        // Simulate port assignment (in real implementation, this would be dynamic)
        deployment.port = 3000 + Math.floor(Math.random() * 1000);
        await deployment.save();

        console.log(`Blue-Green deployment ${deployment._id} completed successfully`);
      } catch (error) {
        console.error('Blue-Green deployment simulation error:', error);
        deployment.status = 'failed';
        await deployment.save();
      }
    }, 2000);

    res.json({
      success: true,
      message: 'Blue-Green deployment started',
      deployment: {
        id: deployment._id,
        version: deployment.version,
        status: deployment.status
      }
    });

  } catch (error) {
    console.error('Blue-Green deployment error:', error);
    res.status(500).json({ error: 'Failed to start Blue-Green deployment' });
  }
});

// Get commits for an app
router.get('/:id/commits', auth, async (req, res) => {
  try {
    const app = await App.findOne({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const commits = await GitHubService.getRepoCommits(app.githubUrl, 20);
    
    res.json({
      success: true,
      commits: commits,
      app: {
        name: app.name,
        githubUrl: app.githubUrl
      }
    });
  } catch (error) {
    console.error('Get commits error:', error);
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// Enable auto-deploy for an app
router.post('/:id/enable-auto-deploy', auth, async (req, res) => {
  try {
    const app = await App.findOne({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Start polling for this app
    await PollingService.startPollingForApp(app._id);

    res.json({
      success: true,
      message: `Auto-deploy enabled for ${app.name}. Polling every 30 seconds.`,
      polling: true
    });

  } catch (error) {
    console.error('Enable auto-deploy error:', error);
    res.status(500).json({ error: 'Failed to enable auto-deploy' });
  }
});

// Disable auto-deploy
router.post('/:id/disable-auto-deploy', auth, async (req, res) => {
  try {
    const app = await App.findOne({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Stop polling
    PollingService.stopPolling(app._id);

    // Update app
    app.autoDeploy = false;
    app.pollingEnabled = false;
    await app.save();

    res.json({
      success: true,
      message: `Auto-deploy disabled for ${app.name}`,
      polling: false
    });

  } catch (error) {
    console.error('Disable auto-deploy error:', error);
    res.status(500).json({ error: 'Failed to disable auto-deploy' });
  }
});

// Get polling status
router.get('/:id/polling-status', auth, async (req, res) => {
  try {
    const app = await App.findOne({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const status = PollingService.getPollingStatus(app._id);

    res.json({
      success: true,
      polling: status,
      app: {
        name: app.name,
        autoDeploy: app.autoDeploy
      }
    });

  } catch (error) {
    console.error('Get polling status error:', error);
    res.status(500).json({ error: 'Failed to get polling status' });
  }
});

module.exports = router;
