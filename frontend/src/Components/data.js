export const complaints = [
  { id: "SHG-2026-1049", title: "Sewage overflow in Aminabad lane", category: "Drainage & Sewage", desc: "Sewage is overflowing from a blocked drain into the lane and creating an unsafe, unsanitary passage for residents.", address: "Aminabad lane", ward: "Ward 5 - Aminabad", priority: "High", deadline: "30 Sep 2026", remaining: "12d overdue", overdue: true, status: "Escalated", level: "L3 - Commissioner", dept: "Nagar Nigam - Drainage, Zone 1 - M. Prasad (JE)", lastEvent: "Escalated to Municipal Commissioner.", next: "Commissioner review", overBy: "13 days" },
  { id: "SHG-2026-1042", title: "Deep pothole near Gomti Nagar crossing", category: "Roads & Potholes", ward: "Ward 12 - Gomti Nagar", priority: "High", deadline: "8 Oct 2026", remaining: "4d overdue", overdue: true, status: "Escalated", level: "L2 - Zonal Officer", dept: "Road Department - Zone 4 - R. Verma (JE)", lastEvent: "Escalated to Zonal Officer after deadline.", next: "Escalate to Municipal Commissioner", overBy: "5 days",
    desc: "A deep pothole has opened up right at the Vivek Khand crossing. Two-wheelers are swerving into the opposite lane to avoid it. It gets worse every time it rains and is dangerous at night.",
    address: "Vivek Khand crossing, near Patrakarpuram market" },
  { id: "SHG-2026-1015", title: "Open drain near primary school", category: "Drainage & Sewage", desc: "An uncovered drain beside the primary school is a hazard for children and pedestrians.", address: "Near the primary school, Alambagh", ward: "Ward 30 - Alambagh", priority: "Critical", deadline: "5 Oct 2026", remaining: "7d overdue", overdue: true, status: "Overdue", level: "L1 - Ward Officer" },
  { id: "SHG-2026-0995", title: "Illegal dumping on riverbank road", category: "Garbage Collection", desc: "Waste is being dumped along the riverbank road and needs to be cleared.", address: "Riverbank road, Gomti Nagar Extension", ward: "Ward 13 - Gomti Nagar Ext", priority: "Medium", deadline: "16 Oct 2026", remaining: "4d left", status: "Reopened", level: "L1 - Ward Officer", canStart: true },
  { id: "SHG-2026-1052", title: "Hand pump broken in Chowk", category: "Water Supply & Leakage", desc: "The public hand pump is broken and residents cannot access water from it.", address: "Chowk", ward: "Ward 6 - Chowk", priority: "High", deadline: "12 Oct 2026", remaining: "Due today", status: "In Progress", level: "L0 - Officer" },
  { id: "SHG-2026-1057", title: "Streetlight dead for a week", category: "Streetlights & Electricity", ward: "Ward 8 - Aliganj", priority: "Medium", deadline: "14 Oct 2026", remaining: "2d left", status: "In Progress", level: "L0 - Officer",
    desc: "Three consecutive streetlights are dead on the stretch behind the Lucknow Public College gate. The lane is pitch dark after 7 PM.", lastEvent: "Officer started work. Cable fault iden..." },
  { id: "SHG-2026-1061", title: "Garbage not collected for 4 days", category: "Garbage Collection", ward: "Ward 3 - Hazratganj", priority: "Medium", deadline: "17 Oct 2026", remaining: "5d left", status: "Assigned", level: "L0 - Officer",
    desc: "The community bin near Hazratganj market lane 3 has not been cleared in four days. Waste is overflowing onto the footpath." },
];

export const workload = [["Roads & Potholes", 4], ["Drainage & Sewage", 3], ["Water Supply", 3], ["Streetlights", 2], ["Garbage", 2]];
export const resolutions = [["May", 9], ["Jun", 12], ["Jul", 8], ["Aug", 14], ["Sep", 11], ["Oct", 16]];
export const categories = ["Roads & Potholes", "Drainage & Sewage", "Water Supply & Leakage", "Streetlights & Electricity", "Garbage Collection", "Parks & Public Spaces", "Other Civic Issues"];
export const timeline = [
  ["Complaint submitted", "28 Sep, 9:14 AM", "Reported with photo and GPS tag."],
  ["Assigned to Road Dept - Zone 4", "28 Sep, 10:02 AM", "Auto-assigned to R. Verma (JE)."],
  ["Assignment acknowledged", "28 Sep, 11:30 AM", "Officer acknowledged the complaint."],
  ["Deadline missed", "8 Oct, 11:59 PM", "Escalated to Ward Officer (L1)."],
  ["Escalated to Zonal Officer", "10 Oct, 9:00 AM", "Escalated to Zonal Officer after deadline."],
];