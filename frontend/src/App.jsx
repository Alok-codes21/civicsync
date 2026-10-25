import {useCallback,useEffect,useState} from 'react';
import {BrowserRouter,useLocation,useNavigate} from 'react-router-dom';
import Landing from './Components/Landing.jsx';
import {Report,Success,MyComplaints,PublicDashboard} from './Components/citizen.jsx';
import {CitizenShell,OfficialShell} from './Components/ui.jsx';
import {Overview} from './Components/official.jsx';
import {useTheme} from './Components/theme.js';
import {api,adapt,setToken,uploadEvidence} from './api.js';
import {CaseDetail,StaffQueue,Escalations} from './Components/workflows.jsx';
const staff=['official','supervisor','reviewer','intake'];
function Workspace(){
 const [theme,toggle]=useTheme(), navigate=useNavigate(),location=useLocation();
 const parts=location.pathname.split('/').filter(Boolean),page=parts[0]||'landing',id=parts[1];
 const [user,setUser]=useState(null),[ready,setReady]=useState(false),[list,setList]=useState([]),[publicList,setPublicList]=useState([]),[queue,setQueue]=useState({transfers:[],extensions:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[created,setCreated]=useState(null);
 const go=(p,id)=>{setError('');navigate('/'+(p==='landing'?'':p)+(id?'/'+encodeURIComponent(id):''));window.scrollTo(0,0);};
 useEffect(()=>{api('/me').then(d=>setUser(d.user)).catch(e=>{if(e.status===401)setToken('');else setError('Backend unavailable. '+e.message);}).finally(()=>setReady(true));},[]);
 const refresh=useCallback(async()=>{
  setLoading(true);try{
   if(user){const d=await api(staff.includes(user.role)?'/work-queue':'/complaints?mine=true&limit=100');setList(d.complaints.map(adapt));setQueue(d);}
   const d=await api('/complaints?limit=100');setPublicList(d.complaints.map(adapt));
  }catch(e){setError(e.message);}finally{setLoading(false);}
 },[user]);
 useEffect(()=>{if(ready)queueMicrotask(refresh);},[ready,refresh]);
 useEffect(()=>{if(!ready||!id||page!=='detail')return;let live=true;api('/complaints/'+encodeURIComponent(id)).then(d=>{if(live)setList(old=>[adapt(d.complaint),...old.filter(c=>c.id!==d.complaint.id)]);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id,page,ready]);
 const signIn=async(credentials)=>{try{setError('');const d=await api(credentials.signup?'/signup':'/login',{method:'POST',body:credentials});setToken(d.token);setUser(d.user);go(staff.includes(d.user.role)?'overview':'mine');return true;}catch(e){setError(e.message);return false;}};
 const signOut=async()=>{try{await api('/logout',{method:'POST'});}catch(e){setError('Server sign-out could not be confirmed: '+e.message);}finally{setToken('');setUser(null);setList([]);navigate('/');}};
 const submit=async(f)=>{try{setError('');const d=await api('/complaints',{method:'POST',headers:{'Idempotency-Key':f.intakeKey},body:{title:f.title,description:f.desc,category:f.category,ward:f.ward||f.location.address,landmark:f.location.address,...(f.location.latitude!=null?{lat:f.location.latitude,lon:f.location.longitude,accuracy:f.location.accuracy}: {})}});setCreated(adapt(d.complaint));setList(old=>[adapt(d.complaint),...old.filter(c=>c.id!==d.complaint.id)]);let photoError='';for(const photo of f.photos){try{await uploadEvidence(d.complaint.id,photo.file);}catch(e){photoError=e.message;break;}}await refresh();go('success');if(photoError)setError('Complaint saved as '+d.complaint.id+', but photo upload failed: '+photoError+'. Open the case to retry evidence only.');return true;}catch(e){setError(e.message);return false;}};
 if(!ready)return <div className="card form-card" role="status">Checking your session...</div>;
 if(page==='landing')return <Landing go={go} theme={theme} toggle={toggle} auth={user?{...user,role:user.role==='citizen'?'public':user.role}:null} onAuth={signIn} onSignOut={signOut} notice={error}/>;
 const protectedPages=['report','mine','overview','assigned','escalation','drafts'];
 if(protectedPages.includes(page)&&!user)return <Landing go={go} theme={theme} toggle={toggle} onAuth={signIn} notice="Sign in to use this workspace."/>;
 const isStaff=staff.includes(user?.role);
 if((['overview','assigned','escalation'].includes(page)&&!isStaff)||(page==='report'&&user?.role!=='citizen'))return <div className="card form-card"><h1>Access restricted</h1><p>Your account does not have this role.</p><button className="btn" onClick={()=>go('landing')}>Home</button></div>;
 const shell={page,go,theme,toggle,onSignOut:signOut,auth:user?{...user,role:user.role==='citizen'?'public':user.role}:null,complaints:list,drafts:[]};const Shell=isStaff?OfficialShell:CitizenShell;
 return <Shell {...shell}><div className="prototype-notice">Prototype · No municipal connection · Evidence signals need human review</div>{error&&<div className="storage-alert" role="alert">{error}</div>}{loading&&<p role="status">Refreshing from backend...</p>}
 {page==='report'&&<Report go={go} onSubmit={submit} onSaveDraft={async()=>{setError('Draft sync is not supported by this backend. Your unsent form stays open until you leave.');return false;}} complaints={[]} />}
 {page==='mine'&&<><div className="workspace-intro"><div><h1>Your complaints.</h1><p>Every next step, in view.</p></div><button className="btn primary" onClick={()=>go('report')}>Report an issue</button></div><MyComplaints go={go} list={list}/><button className="btn" onClick={refresh}>Refresh cases</button></>}
 {page==='success'&&(created?<Success c={created} go={go}/>:<p>Open My Complaints to find your submitted case.</p>)}
 {page==='detail'&&<CaseDetail id={id} user={user} go={go} onChange={refresh}/>}
 {page==='public'&&<PublicDashboard complaints={publicList} go={go} role={user?.role==='citizen'?'public':user?.role}/>}
 {page==='overview'&&<Overview go={go} complaints={list}/>}
 {page==='assigned'&&<StaffQueue user={user} list={list} queue={queue} go={go} refresh={refresh}/>}
 {page==='escalation'&&<Escalations user={user} go={go}/>}
 {page==='drafts'&&<div className="card form-card"><h1>Drafts</h1><p>Server-side draft saving is not available. No complaint is submitted until the backend confirms it.</p><button className="btn" onClick={()=>go('report')}>Start a report</button></div>}
 {!['report','mine','success','detail','public','overview','assigned','escalation','drafts'].includes(page)&&<div className="card form-card"><h1>Page not found</h1><button className="btn" onClick={()=>go('landing')}>Home</button></div>}
 </Shell>;
}
export default function App(){return <BrowserRouter><Workspace/></BrowserRouter>;}
