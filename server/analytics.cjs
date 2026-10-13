// Descriptive calculations, not calibrated predictions or causal effects.
const DAY=86400000
function distance(a,b){const r=Math.PI/180,h=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(h)))}
function clusters(rows,{radius=150,minIssues=3,now=Date.now(),days=90}={}){
  const valid=rows.filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&c.submittedTs>=now-days*DAY),seen=new Set(),out=[]
  for(const seed of valid){if(seen.has(seed.id))continue;const group=[],queue=[seed];seen.add(seed.id)
    while(queue.length){const c=queue.shift();group.push(c);for(const n of valid){if(!seen.has(n.id)&&n.category===c.category&&distance(c,n)<=radius){seen.add(n.id);queue.push(n)}}}
    const issues=new Set(group.map(c=>c.issueId||c.id)).size,recurrences=group.reduce((s,c)=>s+(c.reopenCount||0),0),overdue=group.filter(c=>c.status!=='Resolved'&&c.deadlineTs<now).length
    out.push({category:seed.category,approximateCentre:{lat:+(group.reduce((s,c)=>s+c.lat,0)/group.length).toFixed(3),lon:+(group.reduce((s,c)=>s+c.lon,0)/group.length).toFixed(3)},reports:group.length,uniqueIssues:issues,recurrences,overdue,maintenanceReview:issues>=minIssues,riskReviewTier:issues>=minIssues&&(recurrences>0||overdue>0)?'high':issues>=minIssues?'medium':'low',signals:{repeatedIssues:issues>=minIssues,recurrence:recurrences>0,overdue:overdue>0},probability:null})
  }return out
}
function metrics(rows,now=Date.now()){
 const resolved=rows.filter(x=>x.status==='Resolved'&&Number.isFinite(x.resolvedTs)),times=resolved.map(x=>(x.resolvedTs-x.submittedTs)/3600000).filter(x=>x>=0).sort((a,b)=>a-b),n=times.length
 const matured=rows.filter(x=>Number.isFinite(x.originalDeadlineTs)&&x.originalDeadlineTs<=now),onTime=matured.filter(x=>x.status==='Resolved'&&x.resolvedTs<=x.originalDeadlineTs).length
 return {total:rows.length,resolved:resolved.length,pending:rows.length-resolved.length,uniqueIssues:new Set(rows.map(x=>x.issueId||x.id)).size,overdue:rows.filter(x=>x.status!=='Resolved'&&now>x.deadlineTs).length,escalated:rows.filter(x=>x.status!=='Resolved'&&x.escalationLevel>0).length,reopenCount:rows.reduce((s,x)=>s+(x.reopenCount||0),0),medianResolutionHours:n?(times[Math.floor((n-1)/2)]+times[Math.floor(n/2)])/2:null,withinOriginalSLA:resolved.filter(x=>x.resolvedTs<=x.originalDeadlineTs).length,maturedSLADenominator:matured.length,maturedSLAOnTime:onTime,maturedSLAOnTimeRate:matured.length?onTime/matured.length:null,bySeverity:Object.fromEntries(['Critical','High','Medium','Low'].map(p=>[p,rows.filter(x=>x.priority===p).length]))}
}
function comparison(rows){const depts=[...new Set(rows.map(x=>x.dept))],strata=[...new Set(rows.map(x=>JSON.stringify([x.category,x.priority])))];const weights=strata.map(key=>({key,weight:rows.filter(x=>JSON.stringify([x.category,x.priority])===key&&x.originalDeadlineTs<=Date.now()).length})).filter(x=>x.weight);const total=weights.reduce((s,x)=>s+x.weight,0)
 return depts.map(dept=>{const subset=rows.filter(x=>x.dept===dept),parts=weights.map(w=>({...w,...metrics(subset.filter(x=>JSON.stringify([x.category,x.priority])===w.key))})),eligible=parts.length>0&&parts.every(x=>x.maturedSLADenominator>=10);return {dept,...metrics(subset),sampleSize:subset.length,comparisonEligible:eligible,strata:parts,standardizedSLARate:eligible?parts.reduce((s,x)=>s+x.weight/total*x.maturedSLAOnTimeRate,0):null,ranking:null}})
}
module.exports={distance,clusters,metrics,comparison}
