import DemoNotice from "./demo-notice";
import { useState } from "react";
import { LuMapPin, LuTimer, LuShieldCheck, LuUser, LuBuilding2, LuGlobe, LuArrowRight, LuLogOut } from "react-icons/lu";
import { Logo, ThemeBtn } from "./ui";

function LandingAccess({ auth, onAuth, onSignOut, go, notice }) {
  
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (mode === "signup" && name.trim().length < 2) {
      setError("Enter your name to create a profile.");
      return;
    }
    if (mode === "signup" && !/^[a-z0-9_-]{3,60}$/i.test(email.trim())) {
      setError("Use 3-60 letters, numbers, underscores or hyphens for your username, not an email address.");
      return;
    }
    setError("");
    if (password.length < (mode === "signup" ? 12 : 1) || password.length > 128) {
      setError("Signup password must be 12-128 characters.");
      return;
    }
    setBusy(true);
    try { await onAuth({ signup: mode === "signup", name: name.trim(), username: email.trim(), password }); } finally { setBusy(false); }
  };

  if (auth) {
    const official = auth.role !== "public";
    return (
      <aside className="landing-access signed-in-card">
        <span className="access-kicker"><LuShieldCheck /> Session active</span>
        <h2>{official ? "Official dashboard" : "Welcome to CivicSync"}</h2>
        <p>Signed in as <b>{auth.name || auth.email}</b></p>
        <button className="btn primary access-submit" onClick={() => go(official ? "overview" : "mine")}>
          {official ? "Open official dashboard" : "Open public dashboard"} <LuArrowRight />
        </button>
        {!official && <button className="btn access-submit" onClick={() => go("report")}>Report an issue</button>}
        <button className="access-signout" onClick={onSignOut}><LuLogOut /> Sign out</button>
      </aside>
    );
  }

  return (
    <aside className="landing-access">
      <span className="access-kicker"><LuShieldCheck /> CivicSync access</span>
      <h2>{mode === "signin" ? "Sign in to continue" : "Create your profile"}</h2>
      <p className="access-intro">Choose your portal. Public dashboard reports can also be viewed without signing in.</p>
      <div className="access-tabs" role="group" aria-label="Account action">
        <button type="button" className={mode === "signin" ? "selected" : ""} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
        <button type="button" className={mode === "signup" ? "selected" : ""} onClick={() => { setMode("signup"); setError(""); }}>Sign up</button>
      </div>
      <form className="access-form" onSubmit={submit}>
        {mode === "signup" && <DemoNotice/>}
        <p className="muted">Your backend account determines your role.</p>
        {mode === "signup" && (
          <>
            <label htmlFor="access-name">Name</label>
            <input id="access-name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          </>
        )}
        <label htmlFor="access-email">Username</label>
        <input id="access-email" type="text" required value={email} onChange={(event) => setUsername(event.target.value)} placeholder="your_username" />
        {mode === "signup" && <small id="username-help">3-60 letters, numbers, underscores or hyphens. Not an email address.</small>}
        <label htmlFor="access-password">Password</label>
        <input id="access-password" type="password" required maxLength={128} minLength={mode === "signup" ? 12 : 1} value={password}
          onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 12 characters" : "Your password"} />
        {mode === "signup" && <small>12-128 characters. No special character required. Use a test-only password for this temporary demo.</small>}
        {(error || notice) && <span className="access-error" role="alert">{error || notice}</span>}
        <button disabled={busy} className="btn primary access-submit" type="submit">{mode === "signin" ? "Sign in" : "Create account"} <LuArrowRight /></button>
      </form>
      <small className="access-disclaimer">Credentials are checked by the CivicSync backend. Only citizens can create accounts; staff accounts must already exist.</small>
    </aside>
  );
}

export default function Landing({ go, theme, toggle, auth, onAuth, onSignOut, notice }) {
  const cards = [
    [LuUser, "Citizen Portal", "Report an issue in seconds, track it live, and watch missed deadlines climb to higher authority.", "report"],
    [LuBuilding2, "Official Dashboard", "Assigned complaints, deadline countdowns, escalation alerts and resolution verification in one console.", "overview"],
    [LuGlobe, "Public Dashboard", "Open city statistics, department performance and a public complaint feed. Transparency for everyone.", "public"],
  ];
  return (
    <div className="landing">
      <div className="wrap">
        <div className="landing-top">
          <Logo sub="Civic Issue Escalation" />
          <div style={{ display: "flex", gap: 12 }}>
            <ThemeBtn theme={theme} toggle={toggle} />
            <button className="btn soft" style={{ border: "1px solid #f1c0ac" }} onClick={() => go("report")}>Report an Issue</button>
          </div>
        </div>
        <div className="landing-content">
          <div className="landing-hero">
            <div className="landing-intro">
              <div className="eyebrow" style={{ color: "var(--accent)", letterSpacing: "0.2em" }}>Civic Issue Escalation System</div>
              <h1>Your neighbourhood.<br />Your voice, <em>followed through.</em></h1>
              <p className="lead">
                Report civic issues, track backend deadlines and review repair evidence. A local prototype, not a connected government service.
              </p>
              <div className="chips">
                <span><LuMapPin /> Optional GPS</span>
                <span><LuTimer /> Deadline tracking</span>
                <span><LuShieldCheck /> Escalation tracking</span>
              </div>
            </div>
            <LandingAccess notice={notice} auth={auth} onAuth={onAuth} onSignOut={onSignOut} go={go} />
          </div>

          <div className="portal-grid">
            {cards.map(([I, t, d, to]) => (
              <button key={t} className="card portal" onClick={() => go(to)}>
                <div className="ic"><I /></div>
                <h3>{t}</h3>
                <p>{d}</p>
                <span className="open">Open <LuArrowRight /></span>
              </button>
            ))}
          </div>
        </div>
        <div className="landing-tagline">CivicSync: Stay connected. Stay impactful.</div>
      </div>
    </div>
  );
}