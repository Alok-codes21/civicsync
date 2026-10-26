// Deployment-only labelling. Does not change the full integrated application.
const fs = require('node:fs');
const file = require('node:path').join(__dirname, '../frontend/dist/index.html');
let html = fs.readFileSync(file, 'utf8');
if (!html.includes('civic-free-demo-notice')) {
  html = html.replace('<title>project</title>', '<title>CivicSync - Temporary Demo</title>');
  html = html.replace('<body>', '<body><aside id="civic-free-demo-notice" role="note" style="padding:10px 16px;background:#fff2cc;color:#392c0a;font:14px/1.5 system-ui;text-align:center;border-bottom:1px solid #d6bd74">Temporary demo - synthetic data only. Do not enter personal information or real citizen photos. Data can disappear on restart or redeploy. Photo AI detector is disabled. Demo login: alok / demo123.</aside>');
  fs.writeFileSync(file, html);
}
