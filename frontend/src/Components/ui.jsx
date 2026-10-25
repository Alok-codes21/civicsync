import {Link} from 'react-router-dom';
import { useState } from "react";
import {
  LuShieldCheck, LuMoon, LuSun, LuBell, LuLogOut, LuLayoutDashboard, LuListChecks,
  LuTriangleAlert, LuGlobe,
} from "react-icons/lu";

export const Logo = ({ sub, onClick }) => (
  <button className="logo logo-button" onClick={onClick} aria-label="CivicSync home">
    <div className="logo-mark"><LuShieldCheck /></div>
    <div><b>CivicSync</b><small>{sub}</small></div>
  </button>
);

export const ThemeBtn = ({ theme, toggle }) => (
  <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
    {theme === "light" ? <LuMoon /> : <LuSun />}
  </button>
);

const slug = (s) => s.toLowerCase().replace(/\s+/g, "");
export const StatusBadge = ({ s }) => <span className={`badge dotted b-${slug(s)}`}>{s}</span>;
export const PriorityBadge = ({ p }) => <span className={`badge b-${slug(p)}`}>{p}</span>;
export const LevelBadge = ({ l, plain }) =>
  plain ? <span style={{ fontSize: 12 }} className="muted">{l}</span> : <span className="badge b-level">{l}</span>;

export function CitizenShell({ page, go, theme, toggle, children, complaints = [], drafts = [], auth, onSignOut }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [grievanceNotifications, setGrievanceNotifications] = useState([]);
  const links = [["landing", "Home"], ["report", "Report"], ["mine", "My Complaints"], ["drafts", "Drafts"], ["public", "Public"]];
  const toggleNotifications = () => {
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return;
    }
    setGrievanceNotifications([]);setNotificationError('');
    setNotificationsOpen(true);
  };
  const complaintNotifications = complaints.flatMap((complaint) => {
    const events = complaint.events?.length
      ? complaint.events
      : complaint.createdAt
        ? [{ title: "Complaint submitted", createdAt: complaint.createdAt }]
        : ["Escalated", "Overdue"].includes(complaint.status)
          ? [{ title: `Complaint ${complaint.status.toLowerCase()}`, createdAt: "" }]
          : [];
    return events.map((event, index) => ({
      id: `complaint-${complaint.id}-${index}`,
      complaintId: complaint.id,
      title: event.title,
      message: complaint.title,
      createdAt: event.createdAt || "",
      page: "detail",
    }));
  });
  const draftNotifications = drafts.map((draft) => ({
    id: `draft-${draft.id}`,
    title: "Draft saved",
    message: draft.title || "Untitled complaint",
    createdAt: draft.updatedAt || "",
    page: "drafts",
  }));
  const notifications = [...grievanceNotifications, ...complaintNotifications, ...draftNotifications]
    .sort((a, b) => Date.parse(b.createdAt || "1970-01-01") - Date.parse(a.createdAt || "1970-01-01"));
  const openNotification = (notification) => {
    setNotificationsOpen(false);
    go(notification.page, notification.complaintId);
  };
  return (
    <>
      <header className="c-nav">
        <div className="in">
          <Logo sub="Citizen Portal" onClick={() => go("landing")} />
          <div className="c-links">
            {links.map(([k, l]) => (
              <Link key={k} to={k==='landing'?'/':'/'+k} aria-current={page===k?'page':undefined} className={page === k || (k === "mine" && page === "detail") ? "active" : ""}>{l}</Link>
            ))}
            <span className="sp" />
            <Link to="/operations" className="btn sm">Metrics</Link><Link to="/service" className="btn sm">Service info</Link><ThemeBtn theme={theme} toggle={toggle} />
            <div className="notification-wrap">
              <button className="icon-btn" aria-label="Notifications" aria-expanded={notificationsOpen}
                aria-controls="notification-panel" onClick={toggleNotifications}>
                <LuBell />{notifications.length > 0 && <span className="dot" />}
              </button>
              {notificationsOpen && (
                <section className="notification-panel card" id="notification-panel" aria-label="Notifications">
                  <div className="notification-head">
                    <h2>Notifications</h2>
                    <button className="notification-close" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button>
                  </div>
                  {notificationError && <p className="notification-error" role="alert">{notificationError}</p>}
                  {notifications.length === 0 ? (
                    <p className="notification-empty">You’re all caught up. There are no notifications yet.</p>
                  ) : (
                    <div className="notification-list">
                      {notifications.map((notification) => (
                        <button className="notification-item" key={notification.id}
                          onClick={() => openNotification(notification)}>
                          <span className="notification-title">{notification.title}</span>
                          <span className="notification-message">{notification.message}</span>
                          {notification.createdAt && (
                            <time>{new Date(notification.createdAt).toLocaleString()}</time>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
            {auth
              ? <button className="icon-btn plain" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LuLogOut /></button>
              : <button className="btn sm" onClick={() => go("landing")}>Sign in</button>}
          </div>
        </div>
      </header>
      <main className="c-page">{children}</main>
    </>
  );
}

export function OfficialShell({ page, go, theme, toggle, children, onSignOut, auth }) {
  const nav = [
    ["overview", "Overview", LuLayoutDashboard],
    ["assigned", "Assigned Complaints", LuListChecks],
    ["escalation", "Escalation Center", LuTriangleAlert],
    ["public", "Public Dashboard", LuGlobe],
  ];
  return (
    <div className="o-shell">
      <aside className="side">
        <Logo sub="Official Console" onClick={() => go("landing")} />
        <nav>
          {nav.map(([k, l, I]) => (
            <Link key={k} to={k==='landing'?'/':'/'+k} aria-current={page===k?'page':undefined} className={page === k ? "active" : ""}><I size={18} /> {l}</Link>
          ))}
        </nav>
        <div className="signed">
          <small>Signed in as</small>
          <b>{auth?.name || auth?.username || "Staff"}</b><small>{auth?.role}</small>
          <div className="row">
            <button className="so" onClick={onSignOut}><LuLogOut /> Sign out</button>
            <Link to="/operations" className="btn sm">Metrics</Link><Link to="/service" className="btn sm">Service info</Link><ThemeBtn theme={theme} toggle={toggle} />
          </div>
        </div>
      </aside>
      <nav className="official-mobile-nav" aria-label="Official dashboard">
        {nav.map(([key, label, Icon]) => (
          <button key={key} className={`btn sm ${page === key ? "soft" : ""}`} onClick={() => go(key)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>
      <main className="o-main">{children}</main>
    </div>
  );
}