export default function DemoNotice({upload=false}) {
  if (!window.__CIVIC_FREE_DEMO__) return null;
  return <p className="muted" role="note" style={{fontSize:12,lineHeight:1.5,margin:'8px 0'}}>Use synthetic test data only. No personal details or real citizen photos. Data is temporary.{upload&&' Photo AI detector is off; uploads receive basic checks and human review only.'}</p>;
}
