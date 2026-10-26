// Host the existing API and frontend together without modifying API implementation.
const {spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=process.env.PORT||'8080',apiPort=process.env.API_PORT||'3001';
if(!/^\d+$/.test(port)||!/^\d+$/.test(apiPort)||+port<1||+port>65535||+apiPort<1||+apiPort>65535||+port===+apiPort){console.error('Distinct PORT/API_PORT integers 1-65535 required');process.exit(1);}
const children=[];let stopping=false;
function stop(code){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');const timer=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');process.exit(code);},3000);timer.unref();Promise.all(children.map(c=>new Promise(r=>c.exitCode!==null||c.signalCode?r():c.once('exit',r)))).then(()=>process.exit(code));}
function run(file,env){const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env,...env},stdio:'inherit'});children.push(child);child.on('error',e=>{console.error(e.message);stop(1);});child.on('exit',code=>{if(!stopping)stop(code||1);});return child;}
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
run('scripts/start-api.cjs',{PORT:apiPort,HOST:'127.0.0.1'});
(async()=>{for(let i=0;i<100&&!stopping;i++){try{const r=await fetch(`http://127.0.0.1:${apiPort}/api/health`,{signal:AbortSignal.timeout(500)});if(r.ok){run('scripts/serve-web.cjs',{WEB_PORT:port,WEB_HOST:process.env.WEB_HOST||'0.0.0.0',API_PORT:apiPort});return;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!stopping){console.error('Backend readiness timeout');stop(1);}})();
