const express = require('express');
const App = require('../models/App');
const Deployment = require('../models/Deployment');
const deploymentEngine = require('../services/DeploymentEngine');

const router = express.Router();

// GitHub webhook endpoint
router.post('/github', async (req, res) => {
  try {
    const { repository, head_commit } = req.body;
    
    if (!repository || !head_commit) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    const repoUrl = repository.html_url;
    
    // Find app by GitHub URL
    const app = await App.findOne({ githubUrl: repoUrl });
    if (!app) {
      return res.status(404).json({ error: 'App not found for this repository' });
    }

    // Get latest version and increment
    const latestDeployment = await Deployment.findOne({ appId: app._id })
      .sort({ startedAt: -1 });
    
    const currentVersion = latestDeployment?.version || 'v1';
    const nextVersion = `v${parseInt(currentVersion.slice(1)) + 1}`;

    // Create deployment record
    const deployment = new Deployment({
      version: nextVersion,
      appId: app._id,
      userId: app.userId,
      githubUrl: app.githubUrl,
      status: 'building',
      webhookTrigger: {
        commit: head_commit.id,
        branch: repository.default_branch,
        message: head_commit.message,
        triggeredBy: 'github-webhook'
      }
    });

    await deployment.save();

    // Start deployment process (non-blocking)
    deploymentEngine.deploy(app, nextVersion, app.userId)
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
      })
      .catch(async (error) => {
        deployment.status = 'failed';
        deployment.buildLogs = `Deployment error: ${error.message}`;
        deployment.completedAt = new Date();
        await deployment.save();
      });

    res.json({ 
      success: true, 
      deploymentId: deployment._id,
      message: 'Deployment triggered via webhook',
      version: nextVersion,
      commit: head_commit.id
    });
  } catch (error) {
    console.error('GitHub webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;
