import { LuArrowRight, LuBellRing, LuClock3, LuFileText, LuMapPin, LuShieldCheck } from "react-icons/lu";
import {dueToday} from '../dates.js';
import { complaints } from "./data";
import { PriorityBadge, StatusBadge } from "./ui";

export function Overview({ go, complaints: complaintList = complaints }) {
  const topCards = [
    { label: "Open complaints", value: complaintList.filter((c) => c.status !== "Resolved").length },
    { label: "Due today", value: complaintList.filter((c) => dueToday(c,new Date().getTime())).length },
    { label: "Escalated", value: complaintList.filter((c) => c.status === "Escalated").length },
    { label: "Resolved", value: complaintList.filter((c) => c.status === "Resolved").length },
  ];
  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <div className="stats-grid">
        {topCards.map((card) => (
          <div className="card form-card" key={card.label}>
            <div className="muted" style={{ fontSize: 12 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{card.value}</div>
          </div>
        ))}
      </div>
      <div className="card form-card" style={{ marginTop: 20 }}>
        <div className="eyebrow-sm">CURRENT LOADED QUEUE</div>
        {complaintList.slice(0, 5).map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{c.title}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}><LuMapPin size={12} /> {c.ward}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <StatusBadge s={c.status} />
              <div style={{ marginTop: 8 }}><PriorityBadge p={c.priority} /></div>
            </div>
          </div>
        ))}
      </div>
      <button className="btn primary" style={{ marginTop: 18 }} onClick={() => go("assigned")}>Review all assigned complaints</button>
    </div>
  );
}

export function Assigned({ go, complaints: complaintList = complaints, onUpdateStatus }) {
  const items = complaintList.filter((c) => ["Assigned", "In Progress", "Submitted"].includes(c.status));

  return (
    <div>
      <h1 className="page-title">Assigned Complaints</h1>
      {items.length === 0 && <div className="card notfound">There are no open complaints assigned right now.</div>}
      {items.map((c) => (
        <div className="card my-card" key={c.id} style={{ marginTop: 14 }}>
          <div className="top">
            <div style={{ flex: 1 }}>
              <div className="id">{c.id}</div>
              <h3>{c.title}</h3>
              <p>{c.desc || c.category}</p>
            </div>
            <div className="badges-col">
              <StatusBadge s={c.status} />
              <PriorityBadge p={c.priority} />
            </div>
          </div>
          <div className="bottom">
            <div className="meta">
              <span><LuClock3 size={12} /> {c.remaining}</span>
              <span><LuMapPin size={12} /> {c.ward}</span>
            </div>
            <div className="btn-row">
              <button className="btn sm soft" onClick={() => go("detail", c.id)}>Open <LuArrowRight /></button>
              <button className="btn sm" onClick={() => onUpdateStatus(c.id, c.status === "In Progress" ? "Resolved" : "In Progress")}>
                {c.status === "In Progress" ? "Mark Resolved" : "Start Work"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Escalation({ go, complaints: complaintList = complaints, onEscalate }) {
  const items = complaintList.filter((c) => c.overdue || c.status === "Escalated");

  return (
    <div>
      <h1 className="page-title">Escalation Center</h1>
      {items.length === 0 && <div className="card notfound">There are no overdue or escalated complaints.</div>}
      <div className="card form-card" style={{ marginTop: 18 }}>
        <div className="eyebrow-sm">ESCALATION WATCHLIST</div>
        {items.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{c.id}</div>
              <div style={{ marginTop: 6, color: "var(--muted)" }}><LuFileText size={12} /> {c.title}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="red" style={{ fontWeight: 600 }}>{c.remaining}</div>
              <div style={{ marginTop: 8 }}><StatusBadge s={c.status} /></div>
              <button className="btn sm" style={{ marginTop: 8 }}
                disabled={c.level?.startsWith("L3")} onClick={() => onEscalate(c)}>
                {c.level?.startsWith("L3") ? "At highest level" : "Escalate"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="card form-card" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}><LuBellRing /><strong>Escalation trigger</strong></div>
        <p style={{ margin: "10px 0 0" }}><LuShieldCheck size={14} /> Auto-escalate overdue complaints after the configured SLA window.</p>
      </div>
      <button className="btn primary" style={{ marginTop: 18 }} onClick={() => go("overview")}>Return to overview</button>
    </div>
  );
}
