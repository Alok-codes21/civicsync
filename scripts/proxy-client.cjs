// Render's managed Cloudflare edge overwrites CF-Connecting-IP. Never accept a
// caller-supplied X-Forwarded-For chain or enable edge trust for local hosting.
const {isIP}=require('node:net');
function clientIp(req,render=false){const edge=req.headers['true-client-ip'],cf=req.headers['cf-connecting-ip'];return render&&typeof edge==='string'&&isIP(edge)&&edge===cf?edge:req.socket.remoteAddress;}
function prepare(req,render=false){const ip=clientIp(req,render);delete req.headers.forwarded;delete req.headers['x-forwarded-for'];delete req.headers['x-real-ip'];delete req.headers['cf-connecting-ip'];delete req.headers['true-client-ip'];req.headers['x-forwarded-for']=ip;}
module.exports={clientIp,prepare};
