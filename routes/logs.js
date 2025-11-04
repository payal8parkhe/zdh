const express = require('express');
const auth = require('../middleware/auth');
const Deployment = require('../models/Deployment');

const router = express.Router();

router.get('/deployment/:id', auth, async (req, res) => {
  try {
    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json({
      logs: deployment.buildLogs,
      status: deployment.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
