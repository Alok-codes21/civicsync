// Deployment-only labelling. Does not change the full integrated application.
const fs = require('node:fs');
const file = require('node:path').join(__dirname, '../frontend/dist/index.html');
let html = fs.readFileSync(file, 'utf8');
// Fetch the pinned, checksum-verified local model at build time so the free host can run it (no paid API, no image upload).
let detectorOn = false;
if (process.env.AI_DETECTOR !== 'off') {
  try {
    require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'download-model.cjs')], { stdio: 'inherit' });
    detectorOn = fs.existsSync(require('node:path').join(__dirname, '../models/ai-image-detection.onnx'));
  } catch (e) { console.error('Detector model download failed; detector stays off:', e.message); }
}
if (!html.includes('civic-free-demo-info')) {
  html = html.replace('<title>project</title>', '<title>CivicSync - Demo</title>');
  html = html.replace('<body>', '<body><script>window.__CIVIC_FREE_DEMO__=true;window.__CIVIC_AI_DETECTOR__=' + detectorOn + ';</script><details id="civic-free-demo-info" style="padding:5px 16px;background:#edf3ef;color:#344d43;font:12px/1.5 system-ui;border-bottom:1px solid #d5e2db"><summary style="cursor:pointer;width:max-content">Demo info</summary><p style="margin:6px 0">Synthetic test data only. Do not enter personal information or real citizen photos. Data can disappear on restart or redeploy. ' + (detectorOn ? 'Photo AI detector is on: an experimental, unvalidated score is only a hint and never proof; every photo still gets human review.' : 'Photo AI detector is disabled.') + ' No municipal connection. This prototype is not a production service.</p></details>');
  fs.writeFileSync(file, html);
}
