// Optional local ONNX inference. Never downloads or sends a citizen image to a service.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('sharp')
const defaultModel=path.join(__dirname,'..','models','ai-image-detection.onnx')
function modelFile(){if(process.env.AI_DETECTOR==='off')return null;if(process.env.AI_MODEL_PATH)return process.env.AI_MODEL_PATH;return fs.existsSync(defaultModel)?defaultModel:null}
const revision='e3cfe99f2841930a040a6281682c10c989965603'
let session=null,busy=false,loadPromise=null,state='not_connected'
function enabled(){return Boolean(modelFile())}
function status(){return enabled()?state:'not_connected'}
async function load(){
 if(!enabled())return null
 if(!loadPromise)loadPromise=(async()=>{const file=modelFile();if(!fs.existsSync(file))throw new Error('Model missing');const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(hash!==require('../docs/model-provenance.json').sha256)throw new Error('Model checksum mismatch');const ort=require('onnxruntime-node');session=await ort.InferenceSession.create(file,{executionProviders:['cpu'],intraOpNumThreads:2});state='local_experimental_unvalidated';return session})().catch(()=>{state='unavailable_model_load_failed';return null})
 return loadPromise
}
async function predict(bytes){
 if(!enabled())return {available:false,reason:'AI_DETECTOR_UNAVAILABLE'}
 if(busy)return {available:false,reason:'AI_DETECTOR_BUSY_REVIEW_REQUIRED'}
 busy=true
 try{const s=await load();if(!s)return {available:false,reason:'AI_DETECTOR_UNAVAILABLE'}
 const {data,info}=await sharp(bytes,{limitInputPixels:16000000}).rotate().flatten({background:'#ffffff'}).resize(224,224,{fit:'fill',kernel:'linear'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true})
 if(info.channels!==3)throw new Error('Expected RGB')
 const input=new Float32Array(3*224*224);for(let i=0;i<224*224;i++)for(let c=0;c<3;c++)input[c*224*224+i]=(data[i*3+c]/255-0.5)/0.5
 const ort=require('onnxruntime-node'),out=await s.run({pixel_values:new ort.Tensor('float32',input,[1,3,224,224])}),logits=Array.from(out.logits.data),m=Math.max(...logits),ex=logits.map(x=>Math.exp(x-m)),score=ex[1]/(ex[0]+ex[1]);if(!Number.isFinite(score))throw new Error('Invalid score')
 return {available:true,model:'capcheck_CIFAKE_ViT_quantized',revision,aiClassScore:score,calibrated:false,accuracyOnCivicPhotos:null,decision:'human_review',reason:'AI_MODEL_SCORE_UNVALIDATED',limits:['Older CIFAKE generators','Compression/domain bias','False positives and false negatives','Not proof of image authenticity']}
 }catch(e){return {available:false,reason:'AI_DETECTOR_UNAVAILABLE'}}finally{busy=false}
}
module.exports={load,predict,status}
