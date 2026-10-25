// Same-origin production wrapper. API semantics remain in server/index.cjs.
const express=require('express'),path=require('path');
const {createProxyServer}=require('http-proxy');
const app=express(),port=Number(process.env.WEB_PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535){console.error('Invalid WEB_PORT');process.exit(1);} 
const proxy=createProxyServer({target:'http://127.0.0.1:'+ (process.env.API_PORT||process.env.PORT||3001)});
proxy.on('error',(_err,_req,res)=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Backend unavailable'}));});
app.use('/api',(req,res)=>{req.url='/api'+req.url;proxy.web(req,res);});
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found'}));
app.use(express.static(path.join(__dirname,'../frontend/dist')));
app.get('/{*splat}',(req,res)=>res.sendFile(path.join(__dirname,'../frontend/dist/index.html')));
app.listen(port,process.env.WEB_HOST||'127.0.0.1',()=>console.log('CivicSync web listening on '+port));
