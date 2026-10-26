import {reviewText} from './review-text.js';
const fieldLabels={acknowledgementNumber:'Receipt number',replayed:'Earlier request safely recovered',duplicateCandidates:'Possible related complaints',requiresHumanReview:'Human review needed',jurisdiction:'Routing details',geoWard:'Ward from coordinates',routeVerified:'Municipal routing verified',maturedSLADenominator:'Cases whose original deadlines have passed',maturedSLAOnTime:'Cases completed by their original deadline',maturedSLAOnTimeRate:'On-time rate for cases past the original deadline',withinOriginalSLA:'Completed within original deadline',impactCausality:'Proof that this service caused the impact',medianResolutionHours:'Typical resolution time (hours)',excludesLegacyDemo:'Older demo records excluded'};
const title=value=>fieldLabels[value]||String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,x=>x.toUpperCase());
function Value({value,depth=0}){
 if(value===null||value===undefined)return <span className="muted">Not supplied</span>;
 if(typeof value==='boolean')return <span>{value?'Yes':'No'}</span>;
 if(typeof value!=='object')return <span className="result-value">{String(value).startsWith('http')?<a href={String(value)} target="_blank" rel="noreferrer">{String(value)}</a>:reviewText(value)}</span>;
 if(Array.isArray(value))return value.length?<ol className="result-list">{value.map((item,i)=><li key={i}><Value value={item} depth={depth+1}/></li>)}</ol>:<span className="muted">None returned</span>;
 return <dl className={'result-fields depth-'+Math.min(depth,3)}>{Object.entries(value).map(([key,v])=><div key={key}><dt>{title(key)}</dt><dd><Value value={v} depth={depth+1}/></dd></div>)}</dl>;
}
export function BackendResult({value,label='Result details'}){return <section className="backend-result" aria-label={label}><h3>{label==='Lookup result'?'Reference result':label}</h3><Value value={value}/></section>;}
