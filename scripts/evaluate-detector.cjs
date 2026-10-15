// Local labelled-data evaluation. No uploads; caller provides genuine labels.
const fs=require('fs'),path=require('path'),crypto=require('crypto')
async function evaluate(manifestPath,predict){
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))
 if(manifest.consentToEvaluate!==true||!Array.isArray(manifest.images)||manifest.images.length<2||!['real','ai'].every(label=>manifest.images.some(i=>i.label===label)))throw new Error('Consented labelled real AND AI images required')
 const rows=[],seen=new Set(),counts={tp:0,fp:0,tn:0,fn:0},root=path.dirname(path.resolve(manifestPath))
 for(const row of manifest.images){
  if(!['real','ai'].includes(row.label)||typeof row.file!=='string'||!row.provenance?.trim()||path.isAbsolute(row.file))throw new Error('Relative file, label and provenance required')
  const file=fs.realpathSync(path.resolve(root,row.file));if(!file.startsWith(fs.realpathSync(root)+path.sep))throw new Error('Image must stay within manifest folder')
  const bytes=fs.readFileSync(file);if(!bytes.length||bytes.length>4*1024*1024)throw new Error('Image size limit exceeded')
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');if(seen.has(hash))throw new Error('Duplicate image bytes would bias evaluation');seen.add(hash)
  const r=await predict(bytes);if(!r.available||!Number.isFinite(r.aiClassScore)||r.aiClassScore<0||r.aiClassScore>1)throw new Error('Detector unavailable; no accuracy report produced')
  const flagged=r.aiClassScore>=0.5;counts[row.label==='ai'?(flagged?'tp':'fn'):(flagged?'fp':'tn')]++
  rows.push({label:row.label,sha256:hash,aiClassScore:r.aiClassScore,flagged})
 }
 const n=rows.length
 return {sampleSize:n,threshold:0.5,confusionMatrix:counts,accuracy:(counts.tp+counts.tn)/n,falsePositiveRate:counts.fp/(counts.fp+counts.tn),falseNegativeRate:counts.fn/(counts.fn+counts.tp),rows,calibrated:false,productionDecision:'human_review_only',limits:['User-provided labels and provenance, not independently verified','Dataset-specific result, not population accuracy','No automatic rejection; require diverse held-out civic images']}
}
if(require.main===module)evaluate(process.argv[2],require('../server/detector.cjs').predict).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1})
module.exports={evaluate}
