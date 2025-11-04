const mongoose = require('mongoose');

const appSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  githubUrl: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subdomain: { type: String, required: true, unique: true },
  currentVersion: { type: String, default: 'v1' },
  currentPort: { type: Number },
  buildCommand: { type: String, default: '' },
  startCommand: { type: String, default: '' },
  projectType: { 
    type: String, 
    enum: ['static', 'nodejs', 'python', 'docker', 'react', 'vue'],
    default: 'static'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
publicUrl: { type: String },
status: {
    type: String,
    enum: ['deploying', 'active', 'failed', 'inactive'],
    default: 'deploying'
},
autoDeploy: { 
    type: Boolean, 
    default: false 
},
pollingEnabled: {
    type: Boolean,
    default: false
}
});

module.exports = mongoose.model('App', appSchema);
