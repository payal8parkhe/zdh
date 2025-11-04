const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const router = express.Router();

const execAsync = util.promisify(exec);

router.get('/containers', async (req, res) => {
  try {
    const { stdout } = await execAsync('docker ps -a');
    res.json({ containers: stdout });
  } catch (error) {
    res.json({ error: error.message });
  }
});

router.get('/port/:port', async (req, res) => {
  try {
    const { stdout } = await execAsync(`curl -v http://localhost:${req.params.port} || echo "Curl failed"`);
    res.json({ portCheck: stdout });
  } catch (error) {
    res.json({ error: error.message });
  }
});

module.exports = router;
