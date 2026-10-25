import {useCallback,useEffect,useRef,useState} from 'react';
import {BrowserRouter,useLocation,useNavigate} from 'react-router-dom';
import Landing from './Components/Landing.jsx';
import {Report,Success,MyComplaints,PublicDashboard} from './Components/citizen.jsx';
import {CitizenShell,OfficialShell} from './Components/ui.jsx';
import {Overview} from './Components/official.jsx';
import {useTheme} from './Components/theme.js';
import {api,adapt,setToken,uploadEvidence} from './api.js';
import {CaseDetail,StaffQueue,Escalations} from './Components/workflows.jsx';
import {readLocal,writeLocal,prepareIntake,saveTextDraft} from './intake.js';
const staff=['official','supervisor','reviewer','intake'];
function Workspace(){
 const [theme,toggle]=useTheme(), navigate=useNavigate(),location=useLocation();
 const parts=location.pathname.split('/').filter(Boolean),page=parts[0]||'landing',id=parts[1];
 const identity=useRef(0),refreshGeneration=useRef(0),intakePhotos=useRef([]);
 const [user,setUser]=useState(null),[ready,setReady]=useState(false),[list,setList]=useState([]),[publicList,setPublicList]=useState([]),[queue,setQueue]=useState({transfers:[],extensions:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[created,setCreated]=useState(null),[pendingPhotos,setPendingPhotos]=useState([]),[retryingPhotos,setRetryingPhotos]=useState(false);
 const go=(p,id)=>{setError('');navigate('/'+(p==='landing'?'':p)+(id?'/'+encodeURIComponent(id):''));window.scrollTo(0,0);};
 useEffect(()=>{const expire=()=>{identity.current++;setUser(null);intakePhotos.current=[];setCreated(null);setPendingPhotos([]);setList([]);setQueue({transfers:[],extensions:[]});setError('Session expired. Sign in again.');};window.addEventListener('civicsync:session-expired',expire);return()=>window.removeEventListener('civicsync:session-expired',expire);},[]);
 useEffect(()=>{api('/me').then(d=>setUser(d.user)).catch(e=>{if(e.status===401)setToken('');else setError('Backend unavailable. '+e.message);}).finally(()=>setReady(true));},[]);
 const refresh=useCallback(async()=>{
  const epoch=identity.current,request=++refreshGeneration.current;setLoading(true);try{
   if(user){const d=await api(staff.includes(user.role)?'/work-queue':'/complaints?mine=true&limit=100');if(epoch===identity.current&&request===refreshGeneration.current){setList(d.complaints.map(adapt));setQueue(d);}}
   const d=await api('/complaints?limit=100');if(epoch===identity.current&&request===refreshGeneration.current)setPublicList(d.complaints.map(adapt));
  }catch(e){if(epoch===identity.current&&request===refreshGeneration.current)setError(e.message);}finally{if(epoch===identity.current&&request===refreshGeneration.current)setLoading(false);}
 },[user]);
 useEffect(()=>{if(ready)queueMicrotask(refresh);},[ready,refresh]);
 const retryPhotos=async()=>{if(retryingPhotos||!created)return;setRetryingPhotos(true);const failed=[];for(const photo of pendingPhotos){try{await uploadEvidence(created.id,photo.file);}catch(e){failed.push({...photo,error:e.message});}}setPendingPhotos(failed);setRetryingPhotos(false);if(!failed.length)setError('All queued photos uploaded.');};
 const signIn=async(credentials)=>{try{setError('');const d=await api(credentials.signup?'/signup':'/login',{method:'POST',body:credentials});identity.current++;intakePhotos.current=[];setCreated(null);setPendingPhotos([]);setList([]);setQueue({transfers:[],extensions:[]});setToken(d.token);setUser(d.user);go(staff.includes(d.user.role)?'overview':'mine');return true;}catch(e){setError(e.message);return false;}};
 const signOut=async()=>{identity.current++;intakePhotos.current=[];setCreated(null);setPendingPhotos([]);setList([]);setQueue({transfers:[],extensions:[]});try{await api('/logout',{method:'POST'});}catch(e){setError('Server sign-out could not be confirmed: '+e.message);}finally{setToken('');setUser(null);setList([]);navigate('/');}};
 const submit=async(f)=>{try{setError('');if(f.photos?.length)intakePhotos.current=f.photos;const pending=prepareIntake(user.username,f);const d=await api('/complaints',{method:'POST',headers:{'Idempotency-Key':pending.key},body:pending.payload});writeLocal(user.username,'pending',null);writeLocal(user.username,'draft',null);setCreated(adapt(d.complaint));setList(old=>[adapt(d.complaint),...old.filter(c=>c.id!==d.complaint.id)]);let photoError='';const failed=[];for(const photo of intakePhotos.current){try{await uploadEvidence(d.complaint.id,photo.file);}catch(e){photoError=e.message;failed.push({...photo,error:e.message});}}intakePhotos.current=[];setPendingPhotos(failed);await refresh();go('success');if(photoError)setError('Complaint saved as '+d.complaint.id+', but photo upload failed: '+photoError+'. Open the case to retry evidence only.');return true;}catch(e){if([400,403,413,422].includes(e.status))writeLocal(user.username,'pending',null);setError(e.message);return false;}};
 if(!ready)return <div className="card form-card" role="status">Checking your session...</div>;
 if(page==='landing')return <Landing go={go} theme={theme} toggle={toggle} auth={user?{...user,role:user.role==='citizen'?'public':user.role}:null} onAuth={signIn} onSignOut={signOut} notice={error}/>;
 const protectedPages=['report','mine','overview','assigned','escalation','drafts'];
 if(protectedPages.includes(page)&&!user)return <Landing go={go} theme={theme} toggle={toggle} onAuth={signIn} notice="Sign in to use this workspace."/>;
 const isStaff=staff.includes(user?.role);
 if((['overview','assigned','escalation'].includes(page)&&!isStaff)||(page==='report'&&user?.role!=='citizen'))return <div className="card form-card"><h1>Access restricted</h1><p>Your account does not have this role.</p><button className="btn" onClick={()=>go('landing')}>Home</button></div>;
 const shell={page,go,theme,toggle,onSignOut:signOut,auth:user?{...user,role:user.role==='citizen'?'public':user.role}:null,complaints:list,drafts:[]};const Shell=isStaff?OfficialShell:CitizenShell;
 return <Shell {...shell}><div className="prototype-notice">Prototype · No municipal connection · Evidence signals need human review</div>{error&&<div className="storage-alert" role="alert">{error}</div>}{loading&&<p role="status">Refreshing from backend...</p>}
 {page==='report'&&<><PendingIntake user={user} submit={submit}/>{!readLocal(user.username,'pending')&&<Report key={user.username} draft={readLocal(user.username,'draft')||undefined} go={go} onSubmit={submit} onSaveDraft={async f=>{try{saveTextDraft(user.username,f);setError('Text draft saved in this tab only. Photos and GPS are not saved.');return false;}catch(e){setError('Draft was not saved: '+e.message);return false;}}} complaints={[]} />}</>}
 {page==='mine'&&<><div className="workspace-intro"><div><h1>Your complaints.</h1><p>Every next step, in view.</p></div><button className="btn primary" onClick={()=>go('report')}>Report an issue</button></div><MyComplaints go={go} list={list}/><button className="btn" onClick={refresh}>Refresh cases</button></>}
 {page==='success'&&(created?<><Success c={created} go={go}/>{!!pendingPhotos.length&&<section className="card form-card"><h2>Photos not uploaded</h2><p>The complaint is saved. Retry uploads only, not the complaint.</p><ul>{pendingPhotos.map((photo,i)=><li key={i}>{photo.file.name}: {photo.error}</li>)}</ul><button className="btn" disabled={retryingPhotos} onClick={retryPhotos}>{retryingPhotos?'Retrying...':'Retry failed photos only'}</button><small>Keep this page open to retain the selected files.</small></section>}</>:<p>Open My Complaints to find your submitted case.</p>)}
 {page==='detail'&&<CaseDetail key={`${id}:${user?.username||'public'}`} id={id} user={user} go={go} onChange={refresh}/>}
 {page==='public'&&<PublicDashboard complaints={publicList} go={go} role={user?.role==='citizen'?'public':user?.role}/>}
 {page==='overview'&&<Overview go={go} complaints={list}/>}
 {page==='assigned'&&<StaffQueue user={user} list={list} queue={queue} go={go} refresh={refresh}/>}
 {page==='escalation'&&<Escalations user={user} go={go}/>}
 {page==='drafts'&&<div className="card form-card"><h1>Drafts</h1><p>Text drafts stay in this browser tab only, scoped to your username. Photos and GPS are not saved. No offline sync or server draft storage.</p>{readLocal(user.username,'draft')?<><h2>{readLocal(user.username,'draft').title||'Untitled draft'}</h2><button className="btn" onClick={()=>go('report')}>Continue text draft</button><button className="btn" onClick={()=>{writeLocal(user.username,'draft',null);go('drafts');}}>Delete text draft</button></>:<p>No text draft saved in this tab.</p>}<button className="btn" onClick={()=>go('report')}>Start a report</button></div>}
 {!['report','mine','success','detail','public','overview','assigned','escalation','drafts'].includes(page)&&<div className="card form-card"><h1>Page not found</h1><button className="btn" onClick={()=>go('landing')}>Home</button></div>}
 </Shell>;
}
function PendingIntake({user,submit}){const pending=readLocal(user.username,'pending');const[busy,setBusy]=useState(false);if(!pending)return null;return <section className="card form-card" role="alert"><h2>Submission needs confirmation</h2><p>A prior request may have reached the server. Retry that exact request safely before starting another report. Do not change its text or use a new key.</p><b>{pending.payload.title}</b><p>Photos are not saved across reload. Open the confirmed case to add them.</p><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);await submit({photos:[]});setBusy(false);}}>Retry original request</button></section>;}
export default function App(){return <BrowserRouter><Workspace/></BrowserRouter>;}
