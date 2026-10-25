import { useEffect, useRef, useState } from "react";
import {
  LuArrowLeft, LuSearch, LuCamera, LuUpload, LuSave, LuMapPin, LuCheck, LuCopy,
  LuCirclePlus, LuFileText, LuClock, LuFlag, LuArrowRight, LuRefreshCw, LuPaperclip,
  LuDownload, LuBuilding2, LuUser,
} from "react-icons/lu";
import { complaints, categories } from "./data";
import { StatusBadge, PriorityBadge, LevelBadge } from "./ui";

const Back = ({ onClick }) => (
  <button className="back" onClick={onClick}><LuArrowLeft /> Back</button>
);

const MapBox = ({ label, extra }) => (<div className="location-disclosure"><small>Location supplied by reporter, not independently verified.</small><p>{label}</p>{extra}</div>);
const words = (value) => new Set(
  value.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((word) =>
    !["the", "and", "near", "with", "for", "from", "this", "that", "has", "are"].includes(word)) || [],
);

const findDuplicates = (report, complaints) => {
  const reportWords = words(`${report.title} ${report.desc} ${report.location.address}`);
  return complaints.filter((complaint) => {
    if (complaint.category !== report.category) return false;
    const complaintWords = words(`${complaint.title} ${complaint.desc || ""} ${complaint.address || complaint.ward || ""}`);
    const sharedWords = [...reportWords].filter((word) => complaintWords.has(word)).length;
    const textMatch = reportWords.size > 0 && sharedWords / reportWords.size >= 0.5;
    const coords = complaint.location;
    let nearby = false;
    if (report.location.latitude != null && report.location.longitude != null &&
        coords?.latitude != null && coords?.longitude != null) {
      const radians = (degrees) => degrees * Math.PI / 180;
      const latDelta = radians(coords.latitude - report.location.latitude);
      const lonDelta = radians(coords.longitude - report.location.longitude);
      const distance = 6371000 * 2 * Math.asin(Math.sqrt(
        Math.sin(latDelta / 2) ** 2 +
        Math.cos(radians(report.location.latitude)) * Math.cos(radians(coords.latitude)) *
        Math.sin(lonDelta / 2) ** 2,
      ));
      nearby = distance <= 300;
    }
    return textMatch || nearby;
  });
};

export function Report({ go, onSubmit, onSaveDraft, complaints: existingComplaints, draft, assisted=false }) {
  const [f, setF] = useState(() => draft ? {
    ...draft,
    intakeKey: draft.intakeKey||crypto.randomUUID(),
    hazards: draft.hazards||[],
    photos: (draft.photos || []).map((data) => ({ file: null, url: data, data })),
  } : {
    ...(assisted?{channel:'assisted',language:'en',citizenUsername:'',phone:''}:{}),title: "", category: "", desc: "", hazards: [], ok: false, photos: [], ward: "", intakeKey: crypto.randomUUID(),
    location: { latitude: null, longitude: null, accuracy: null, address: "" },
  });
  const [photoError, setPhotoError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);
  const photoUrls = useRef(new Set());
  useEffect(() => () => photoUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const set = (k) => (e) => setF((current) => ({
    ...current,
    [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
  }));
  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Location is not available in this browser. Enter an address instead.");
      return;
    }
    setLocationError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setF((current) => ({
          ...current,
          location: {
            ...current.location,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          },
        }));
        setLocating(false);
      },
      (error) => {
        setLocationError(error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Allow access in your browser settings or enter an address."
          : "Could not get your location. Try again or enter an address.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };
  const addPhotos = (e) => {
    const selected = Array.from(e.target.files || []);
    const remaining = 4 - f.photos.length;
    const accepted = selected.slice(0, remaining);
    const newPhotos = accepted.map((file) => {
      const url = URL.createObjectURL(file);
      photoUrls.current.add(url);
      return { file, url };
    });
    setF((current) => ({ ...current, photos: [...current.photos, ...newPhotos] }));
    setPhotoError(selected.length > remaining ? "You can attach up to 4 photos." : "");
    e.target.value = "";
  };
  const removePhoto = (index) => {
    const photo = f.photos[index];
    URL.revokeObjectURL(photo.url);
    photoUrls.current.delete(photo.url);
    setF((current) => ({ ...current, photos: current.photos.filter((_, i) => i !== index) }));
    setPhotoError("");
  };
  const valid = f.title.trim() && f.category && f.desc.trim() && f.ok &&
    (f.location.address.trim() || (f.location.latitude != null && f.location.longitude != null));
  const checkDuplicates = () => {
    setDuplicateMatches(findDuplicates(f, existingComplaints));
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    const saved = await onSubmit(f, draft?.id);
    if (!saved) setSubmitting(false);
  };
  const saveDraft = async () => {
    setSavingDraft(true);
    const saved = await onSaveDraft(f, draft?.id);
    if (!saved) setSavingDraft(false);
  };
  const cancel = () => {
    const hasChanges = f.title.trim() || f.category || f.desc.trim() || f.photos.length ||
      f.location.address.trim() || f.location.latitude != null || f.ok;
    if (hasChanges && !window.confirm("Discard unsaved changes? Choose Save Draft first to keep this report.")) return;
    go(draft ? "drafts" : "landing");
  };
  return (
    <>
      <Back onClick={cancel} />
      <h1 className="page-title">Report a Complaint</h1>
      <p className="page-sub">Fields marked * are required. Add a location to help the right team find the issue.</p>
      <form className="form-grid" onSubmit={submit}>
        <div>
          <div className="card form-card">
            {assisted&&<section><h2>Assisted intake</h2><p>Use a known citizen username, or leave blank for an unclaimed report. No claim/recovery or SMS verification is available. Language metadata does not translate this form.</p><label className="field">Citizen username (optional)<input value={f.citizenUsername||''} onChange={set('citizenUsername')}/></label><label className="field">Intake channel<select value={f.channel||'assisted'} onChange={set('channel')}>{['assisted','phone','desk','offline'].map(x=><option key={x}>{x}</option>)}</select></label><label className="field">Report language<select value={f.language||'en'} onChange={set('language')}><option value="en">English</option><option value="hi">Hindi (limited backend messages)</option></select></label><label className="field">Citizen phone (optional, unverified)<input type="tel" value={f.phone||''} onChange={set('phone')}/></label></section>}
            <div className="field"><label htmlFor="report-title">Complaint title *</label>
              <input id="report-title" maxLength={140} required value={f.title} onChange={set("title")} placeholder="e.g. Deep pothole near the market crossing" /></div>
            <div className="field"><label htmlFor="report-category">Category *</label>
              <select id="report-category" required value={f.category} onChange={set("category")}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div className="field" style={{ marginBottom: 0 }}><label htmlFor="report-desc">Description *</label>
              <textarea id="report-desc" maxLength={4000} required value={f.desc} onChange={set("desc")} placeholder="What is the problem? Since when? Who is affected?" /></div>
          </div>
          <div className="card form-card">
            <fieldset><legend>Reported hazards (optional)</legend><p>Choose only what you observed. The backend uses these reports to set priority and deadline; they are not verified hazards or an emergency dispatch service.</p>{Object.entries({open_manhole:'Open manhole',live_wire:'Live wire',unsafe_road:'Unsafe road',water_loss:'Water loss',blocked_access:'Blocked access'}).map(([code,label])=><label className="hazard-option" key={code}><input type="checkbox" checked={(f.hazards||[]).includes(code)} onChange={e=>setF(current=>({...current,hazards:e.target.checked?[...(current.hazards||[]),code]:(current.hazards||[]).filter(x=>x!==code)}))}/>{label}</label>)}</fieldset>
          </div>
          <div className="card form-card">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Photos (up to 4)</label>
              <div className="uploads">
                <input ref={cameraInput} className="visually-hidden" type="file" accept="image/png,image/jpeg" capture="environment" onChange={addPhotos} />
                <input ref={galleryInput} className="visually-hidden" type="file" accept="image/png,image/jpeg" multiple onChange={addPhotos} />
                <button className="upload-box" type="button" aria-label="Take a photo" title="Take a photo"
                  disabled={f.photos.length >= 4} onClick={() => cameraInput.current?.click()}><LuCamera /></button>
                <button className="upload-box" type="button" aria-label="Upload photos" title="Upload photos"
                  disabled={f.photos.length >= 4} onClick={() => galleryInput.current?.click()}><LuUpload /></button>
              </div>
              <small className="muted">Take Photo opens your camera on supported devices. Upload photos from your device.</small>
              {photoError && <small className="upload-error" role="alert">{photoError}</small>}
              {f.photos.length > 0 && (
                <div className="photo-previews">
                  {f.photos.map((photo, index) => (
                    <div className="photo-preview" key={photo.url}>
                      <img src={photo.url} alt={`Complaint attachment ${index + 1}`} />
                      <button type="button" onClick={() => removePhoto(index)} aria-label={`Remove photo ${index + 1}`}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="card form-card">
            <div className="field"><label htmlFor="report-ward">Ward / locality *</label><input id="report-ward" maxLength={140} required value={f.ward || ""} onChange={set("ward")} placeholder="e.g. 38" /></div><div className="field">
              <label htmlFor="report-address">Location or address *</label>
              <input id="report-address" maxLength={180} required={f.location.latitude == null} value={f.location.address}
                onChange={(e) => setF((current) => ({ ...current, location: { ...current.location, address: e.target.value } }))}
                placeholder="Street, landmark, or neighborhood" />
            </div>
            <button className="btn" type="button" onClick={getLocation} disabled={locating}>
              <LuMapPin /> {locating ? "Finding location..." : "Use my current location"}
            </button>
            {f.location.latitude != null && (
              <p className="location-coordinates" aria-live="polite">
                GPS: {f.location.latitude.toFixed(5)}, {f.location.longitude.toFixed(5)}
                {f.location.accuracy != null && ` (within ${Math.round(f.location.accuracy)} m)`}
              </p>
            )}
            {locationError && <small className="upload-error" role="alert">{locationError}</small>}
            <div style={{ marginTop: 14 }}>
              <MapBox label={f.location.latitude != null
                ? `${f.location.latitude.toFixed(4)}, ${f.location.longitude.toFixed(4)}`
                : f.location.address || "Location preview"} />
            </div>
          </div>
        </div>
        <div>
          <div className="card form-card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 500 }}>Before you submit</h3>
            <p className="muted" style={{ fontSize: 13, margin: "8px 0 14px", lineHeight: 1.5 }}>
              Duplicate suggestions are review hints, not proof. Your report remains a separate case.
            </p>
            <button className="btn" type="button" style={{ width: "100%" }}
              disabled={!f.category || !f.title.trim()} onClick={checkDuplicates}>
              <LuSearch /> Check Duplicate
            </button>
            {duplicateMatches && (
              <div className="duplicate-results" aria-live="polite">
                {duplicateMatches.length === 0
                  ? <p className="muted">No local suggestions available. Backend duplicate candidates are returned after submission.</p>
                  : <>
                    <p className="muted">{duplicateMatches.length} possible {duplicateMatches.length === 1 ? "match" : "matches"}:</p>
                    {duplicateMatches.slice(0, 5).map((complaint) => (
                      <div className="duplicate-item" key={complaint.id}>
                        <div><b>{complaint.title}</b><small>{complaint.id} · {complaint.ward || complaint.address || "Private location hidden"}</small></div>
                        <button type="button" className="btn sm" onClick={() => go("detail", complaint.id)}>View</button>
                      </div>
                    ))}
                  </>
                }
              </div>
            )}
          </div>
          <label className="consent">
            <input type="checkbox" required checked={f.ok} onChange={set("ok")} />
            <span>I confirm this report is genuine and I consent to its processing for this civic prototype. *</span>
          </label>
          <button className="btn primary" type="submit" style={{ width: "100%", height: 48, fontSize: 14 }} disabled={!f.ok || submitting}>
            {submitting ? "Saving complaint..." : "Submit Complaint"}
          </button>
          <div className="row2" style={{ marginTop: 16 }}>
            <button className="btn" type="button" disabled={savingDraft} onClick={saveDraft}>
              <LuSave /> {savingDraft ? "Saving..." : "Save Draft"}
            </button>
            <button className="btn" type="button" onClick={cancel}>Cancel</button>
          </div>
        </div>
      </form>
    </>
  );
}

export function Drafts({ list, onDelete, go }) {
  return (
    <div>
      <div className="drafts-heading">
        <div><h1 className="page-title">Saved Drafts</h1><p className="page-sub">{list.length} unfinished reports</p></div>
        <button className="btn primary" onClick={() => go("report")}>New Complaint</button>
      </div>
      {list.length === 0 ? (
        <div className="card notfound">No saved drafts yet. Start a complaint and choose Save Draft to keep it here.</div>
      ) : list.map((draft) => (
        <article className="card draft-card" key={draft.id}>
          <div>
            <div className="id">Saved {new Date(draft.updatedAt).toLocaleString()}</div>
            <h3>{draft.title || "Untitled complaint"}</h3>
            <p>{draft.category || "No category selected"}{draft.location?.address ? ` · ${draft.location.address}` : ""}</p>
          </div>
          <div className="btn-row">
            <button className="btn sm primary" onClick={() => go("report", draft.id)}>Continue</button>
            <button className="btn sm" onClick={() => onDelete(draft.id)}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Success({ c, go }) {
  const [copyStatus, setCopyStatus] = useState("");
  const copyId = async () => {
    try {
      await copyText(c.id);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  };
  return (
    <div className="success">
      <div className="check-circle"><LuCheck /></div>
      <h1>Complaint registered</h1>
      <p className="lead">Saved by the backend. Ownership and routing may still need manual review. Updates are available inside this prototype.</p>
      <div className="card reg-card">
        <div className="reg-head">
          <div><div className="eyebrow">Complaint ID</div><div className="reg-id">{c.id}</div></div>
          <StatusBadge s={c.status} />
        </div>
        <div className="reg-line"><LuMapPin /> {c.ward}</div>
        <div className="reg-line"><LuFileText /> {c.category}</div>
        <div className="deadline-note">
          Expected response deadline: <b>{c.deadline}</b> (backend-calculated). Overdue cases enter the internal escalation queue.
        </div>
      </div>
      <div className="actions-grid">
        <button className="btn primary" onClick={() => go("detail", c.id)}>Track This Complaint</button>
        <button className="btn" onClick={copyId}><LuCopy /> {copyStatus || "Copy Complaint ID"}</button>
        <button className="btn" onClick={() => go("mine")}>View My Complaints</button>
        <button className="btn" onClick={() => go("report")}><LuCirclePlus /> Report Another</button>
      </div>
    </div>
  );
}

const TABS = ["All", "Routing Review", "Assigned", "In Progress", "Verification Pending", "Overdue", "Escalated", "Resolved", "Reopened"];
export function MyComplaints({ go, list }) {
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [grievanceComplaint, setGrievanceComplaint] = useState(null);
  const filtered = list.filter((c) =>
    (tab === "All" || c.status === tab) &&
    (c.id + c.title + c.category).toLowerCase().includes(q.toLowerCase()));
  const shown = [...filtered].sort((a, b) => {
    const aDate = Date.parse(a.createdAt || "1970-01-01");
    const bDate = Date.parse(b.createdAt || "1970-01-01");
    return sort === "newest" ? bDate - aDate : aDate - bDate;
  });
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1 className="page-title">My Complaints</h1><p className="page-sub">{list.length} reports from this account</p></div>
        <select className="btn" aria-label="Sort complaints" value={sort} onChange={(event) => setSort(event.target.value)} style={{ height: 36 }}>
          <option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option>
        </select>
      </div>
      <div className="search" style={{ marginTop: 22 }}>
        <LuSearch /><input aria-label="Search complaints" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ID, title or category" />
      </div>
      <div className="tabs">
        {TABS.map((t) => <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {shown.map((c) => (
        <div className="card my-card" key={c.id}>
          <div className="top">
            <div style={{ flex: 1 }}>
              <div className="id">{c.id}</div>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
              <div className="loc"><LuMapPin size={13} /> {c.ward} - {c.category}</div>
            </div>
            <div className="badges-col">
              <StatusBadge s={c.status} /><PriorityBadge p={c.priority} />
              {c.status === "Escalated" && <LevelBadge l={c.level} />}
            </div>
          </div>
          <div className="bottom">
            <div className="meta">
              <span className={c.overdue ? "overdue" : "overdue"} style={{ color: c.overdue ? "var(--red)" : "var(--muted)" }}>
                <LuClock /> {c.remaining} - {c.deadline}
              </span>
              <span>{c.lastEvent}</span>
            </div>
            <div className="btn-row">
              <button className="btn sm soft" onClick={() => go("detail", c.id)}>Track Progress <LuArrowRight /></button>
              {c.overdue && <button className={`btn sm ${grievanceComplaint?.id === c.id ? "action-active" : ""}`}
                onClick={() => setGrievanceComplaint(c)}><LuFlag /> Grievance options</button>}
            </div>
          </div>
        </div>
      ))}
      {shown.length === 0 && <div className="card notfound">No complaints match your search and filter.</div>}
      {grievanceComplaint && (
        <GrievanceDialog complaint={grievanceComplaint} onClose={() => setGrievanceComplaint(null)} />
      )}
    </>
  );
}

export function Detail({ id, go, complaints: complaintList = complaints, onRefresh, onAddEvidence }) {
  const [grievanceOpen, setGrievanceOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [refreshed, setRefreshed] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [savingEvidence, setSavingEvidence] = useState(false);
  const evidenceInput = useRef(null);
  const c = complaintList.find((x) => x.id === id);
  if (!c)
    return (
      <>
        <Back onClick={() => go("mine")} />
        <div className="card notfound">Complaint {id} not found. Check the acknowledgement number and try again.</div>
      </>
    );
  const levelIdx = ["L1", "L2", "L3"].findIndex((l) => c.level?.startsWith(l));
  const complaintEvents = c.events?.length
    ? c.events.map((event) => [event.title, event.createdAt ? new Date(event.createdAt).toLocaleString() : "", ""])
    : [[c.lastEvent || "Complaint submitted", c.createdAt ? new Date(c.createdAt).toLocaleString() : "", ""]];
  const copyId = async () => {
    try {
      await copyText(c.id);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  };
  const refresh = () => {
    onRefresh?.();
    setRefreshed(true);
    window.setTimeout(() => setRefreshed(false), 2000);
  };
  const addEvidenceFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setSavingEvidence(true);
    setEvidenceError("");
    const saved = await onAddEvidence(c.id, files);
    setSavingEvidence(false);
    if (!saved) setEvidenceError("Evidence could not be added. See the message above and try again.");
  };
  return (
    <>
      <Back onClick={() => go("mine")} />
      <div className="detail-head">
        <div>
          <div className="muted" style={{ fontSize: 13 }}>{c.id}</div>
          <h1>{c.title}</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <StatusBadge s={c.status} /><PriorityBadge p={c.priority} /><LevelBadge l={c.level} />
            <span className="badge b-neutral"><LuClock size={12} /> {c.remaining}</span>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn sm" style={{ height: 36 }} onClick={copyId}>
            <LuCopy /> {copyStatus || "Copy ID"}
          </button>
          <button className="btn sm" style={{ height: 36 }} onClick={refresh}>
            <LuRefreshCw /> {refreshed ? "Refreshed" : "Refresh"}
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <div className="card form-card">
            <div className="eyebrow-sm">ORIGINAL REPORT</div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{c.desc}</p>
            {c.photos?.length > 0 && (
              <div className="evidence-list">
                <div className="eyebrow-sm">PHOTO EVIDENCE ({c.photos.length})</div>
                <div className="photo-previews">
                  {c.photos.map((photo, index) => (
                    <a className="photo-preview" href={photo} target="_blank" rel="noreferrer" key={`${c.id}-photo-${index}`}>
                      <img src={photo} alt={`Evidence for ${c.id}, photo ${index + 1}`} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="info-boxes">
              <div className="info-box"><div className="l"><LuMapPin /> Location</div>{c.ward}<div className="muted" style={{ marginTop: 2 }}>{c.address}</div></div>
              <div className="info-box"><div className="l"><LuBuilding2 /> Assigned to</div>Road Department - Zone 4<div className="muted" style={{ marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}><LuUser size={12} /> R. Verma (JE)</div></div>
            </div>
            <MapBox label={c.ward} />
          </div>
          <div className="card form-card">
            <div className="eyebrow-sm">TIMELINE</div>
            <div className="timeline">
              {complaintEvents.map(([title, date, note], index) => (
                <div className="tl-item" key={`${title}-${index}`}>
                  <b>{title}</b>{date && <small>{date}</small>}{note && <span>{note}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="card form-card">
            <h3 style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 500 }}>Actions</h3>
            <div className="stack">
              <input ref={evidenceInput} className="visually-hidden" type="file" accept="image/png,image/jpeg" multiple
                onChange={addEvidenceFiles} />
              <button className={`btn ${activeAction === "evidence" ? "action-active" : ""}`}
                disabled={savingEvidence || (c.photos?.length || 0) >= 4}
                onClick={() => { setActiveAction("evidence"); evidenceInput.current?.click(); }}>
                <LuPaperclip /> {savingEvidence ? "Saving Evidence..." : "Add Evidence"}
              </button>
              {evidenceError && <small className="upload-error" role="alert">{evidenceError}</small>}
              <button className={`btn ${activeAction === "summary" ? "action-active" : ""}`}
                onClick={() => { downloadSummary(c); setActiveAction("summary"); }}>
                <LuDownload /> Download Summary
              </button>
              <button className={`btn ${activeAction === "grievance" ? "action-active" : ""}`}
                onClick={() => { setActiveAction("grievance"); setGrievanceOpen(true); }}>
                <LuFlag /> Grievance options
              </button>
            </div>
          </div>
          <div className="card form-card">
            <h3 style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 500 }}>Deadline</h3>
            <div className="big-date">{c.deadline}</div>
            <div className="red" style={{ fontSize: 13 }}>{c.remaining}</div>
            <ul className="ladder">
              {["L1 - Ward Officer", "L2 - Zonal Officer", "L3 - Municipal Commissioner"].map((l, i) => (
                <li key={l} className={i <= levelIdx ? "hit" : ""}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {grievanceOpen && <GrievanceDialog complaint={c} onClose={() => setGrievanceOpen(false)} />}
    </>
  );
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Try the legacy clipboard API below when browser permission blocks the modern API.
    }
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard access is unavailable.");
}

function downloadSummary(complaint) {
  const lines = [
    "CivicSync Complaint Summary",
    `Complaint ID: ${complaint.id}`,
    `Title: ${complaint.title}`,
    `Category: ${complaint.category}`,
    `Status: ${complaint.status}`,
    `Priority: ${complaint.priority}`,
    `Location: ${complaint.address || complaint.ward || "Not provided"}`,
    `GPS coordinates: ${complaint.location?.latitude ?? "Not available"}, ${complaint.location?.longitude ?? "Not available"}`,
    `Submitted: ${complaint.createdAt ? new Date(complaint.createdAt).toLocaleString() : "Not available"}`,
    `Deadline: ${complaint.deadline || "Not available"}`,
    `Description: ${complaint.desc || "Not provided"}`,
    `Attachments: ${complaint.photos?.length || 0}`,
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${complaint.id}-summary.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GrievanceDialog({ complaint, onClose }) {
  return <div className="dialog-backdrop"><section className="card grievance-dialog" role="dialog" aria-modal="true" aria-labelledby="grievance-title"><h2 id="grievance-title">Grievance submission unavailable</h2><p>No grievance service is connected. Nothing has been sent and no official has been notified.</p><p>Open complaint {complaint.id} to see the backend timeline. Repair disputes and reopen actions, when allowed, are available there.</p><button className="btn" onClick={onClose}>Close</button></section></div>;
}

export function PublicDashboard({ complaints: complaintList, go, role }) {
  const total = complaintList.length;
  const open = complaintList.filter((complaint) => complaint.status !== "Resolved").length;
  const resolved = complaintList.filter((complaint) => complaint.status === "Resolved").length;
  const escalated = complaintList.filter((complaint) => complaint.status === "Escalated").length;
  const categoriesByCount = categories
    .map((category) => [category, complaintList.filter((complaint) => complaint.category === category).length])
    .sort((a, b) => b[1] - a[1]);
  const latest = [...complaintList].sort((a, b) =>
    Date.parse(b.createdAt || "1970-01-01") - Date.parse(a.createdAt || "1970-01-01"));

  return (
    <div className="public-dashboard">
      <h1 className="page-title">Public Dashboard</h1>
      <p className="page-sub">Public tracking omits private report details. Showing the latest loaded page, not all-time totals.</p>
      {role === "public" && <button className="btn primary" style={{ marginTop: 18 }} onClick={() => go("report")}>Report an Issue</button>}
      <div className="public-stats">
        {[["Total reports", total], ["Open", open], ["Resolved", resolved], ["Escalated", escalated]].map(([label, value]) => (
          <div className="card public-stat" key={label}><span>{label}</span><b>{value}</b></div>
        ))}
      </div>
      <section className="card public-section">
        <h2>Reports by issue category</h2>
        <div className="category-bars">
          {categoriesByCount.map(([category, count]) => (
            <div className="category-row" key={category}>
              <span>{category}</span>
              <div className="category-track"><i style={{ width: `${total ? count / total * 100 : 0}%` }} /></div>
              <b>{count}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="public-section">
        <h2>Recent complaints</h2>
        {latest.length === 0 && <div className="card notfound">No complaints have been reported yet.</div>}
        {latest.map((complaint) => (
          <article className="card public-complaint" key={complaint.id}>
            <div className="public-complaint-heading">
              <div><span className="id">{complaint.id}</span><h3>{complaint.title}</h3></div>
              <StatusBadge s={complaint.status} />
            </div>
            <p>{complaint.desc || complaint.category}</p>
            <div className="public-complaint-footer">
              <span>Private location hidden · {complaint.category}</span>
              <button className="btn sm" onClick={() => go("detail", complaint.id)}>View report</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}