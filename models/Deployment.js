const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
  version: { type: String, required: true },
  appId: { type: mongoose.Schema.Types.ObjectId, ref: 'App', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  githubUrl: { type: String, required: true },
  
  // Commit information
  commitHash: { type: String },
  commitMessage: { type: String },
  commitAuthor: { type: String },
  commitDate: { type: Date },
  
  // Deployment information
  buildLogs: { type: String, default: '' },
  status: {
    type: String,
    enum: ['building', 'testing', 'deploying', 'active', 'failed', 'rolled_back'],
    default: 'building'
  },
  port: { type: Number },
  containerId: { type: String },
  
  // Health monitoring
  healthCheckStatus: {
    type: String,
    enum: ['pending', 'healthy', 'unhealthy'],
    default: 'pending'
  },
  healthStatus: {
    type: String,
    enum: ['unknown', 'healthy', 'unhealthy'],
    default: 'unknown'
  },
  healthChecks: [{
    timestamp: Date,
    status: String,
    responseTime: Number,
    statusCode: Number
  }],
  
  // Zero downtime deployment
  strategy: {
    type: String,
    enum: ['standard', 'blue-green', 'canary'],
    default: 'standard'
  },
  isLive: {
    type: Boolean,
    default: false
  },
  wentLiveAt: Date,
  
  // Deployment source and tracking
  deployedBy: { 
    type: String, 
    enum: ['manual', 'webhook', 'polling'],
    default: 'manual'
  },
  rollbackFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment' },
  isRollback: { type: Boolean, default: false },
  
  // Webhook information (if applicable)
  webhookTrigger: {
    commit: String,
    branch: String,
    message: String,
    triggeredBy: String
  },
  
  // Timestamps
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  duration: { type: Number }
}, {
  timestamps: true
});

deploymentSchema.pre('save', function(next) {
  if (this.completedAt && this.startedAt) {
    this.duration = Math.round((this.completedAt - this.startedAt) / 1000);
  }
  next();
});

module.exports = mongoose.model('Deployment', deploymentSchema);
