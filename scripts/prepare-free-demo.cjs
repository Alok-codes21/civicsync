// Deployment-only labelling. Does not change the full integrated application.
const fs = require('node:fs');
const file = require('node:path').join(__dirname, '../frontend/dist/index.html');
let html = fs.readFileSync(file, 'utf8');
if (!html.includes('civic-free-demo-info')) {
  html = html.replace('<title>project</title>', '<title>CivicSync - Demo</title>');
  html = html.replace('<body>', '<body><script>window.__CIVIC_FREE_DEMO__=true;</script><details id="civic-free-demo-info" style="padding:5px 16px;background:#edf3ef;color:#344d43;font:12px/1.5 system-ui;border-bottom:1px solid #d5e2db"><summary style="cursor:pointer;width:max-content">Demo info</summary><p style="margin:6px 0">Synthetic test data only. Do not enter personal information or real citizen photos. Data can disappear on restart or redeploy. Photo AI detector is disabled. No municipal connection. This prototype is not a production service.</p></details>');
  fs.writeFileSync(file, html);
}
