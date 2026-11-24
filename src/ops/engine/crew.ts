/* Crew records: registration, details, availability, documents and verification. */

import type { DocType, OpsState, Result, Rtw, Worker } from "../model";
import { DOC_LABEL, needsRtw } from "../model";
import { docById, docState, mandatoryTypes, worker } from "../selectors";
import { dayKey, fmtDay } from "../time";
import { actorId, actorName, audit, denied, directThread, isWorker, nid, no, ok, post } from "./core";

export const normEmail = (e: string) => e.trim().toLowerCase();
export const normPhone = (p: string) => { let x = p.replace(/\D/g, ""); if (x.startsWith("353")) x = "0" + x.slice(3); return x; };

export function findDuplicates(d: OpsState, f: { name: string; email: string; mobile: string }) {
  const e = normEmail(f.email), p = normPhone(f.mobile);
  const exact = d.workers.find((w) => (e && normEmail(w.email) === e) || (p.length >= 9 && normPhone(w.mobile) === p));
  const name = f.name.trim().toLowerCase();
  const similar = name ? d.workers.filter((w) => w !== exact && w.name.toLowerCase() === name) : [];
  return { exact, similar };
}

export interface WorkerForm { name: string; email: string; mobile: string; area: string; county: string; roles: string[]; rtw: Rtw }
function nextWorkerId(d: OpsState) {
  return "W" + String(Math.max(...d.workers.map((w) => Number(w.id.slice(1)) || 0)) + 1).padStart(4, "0");
}
export function registerWorker(d: OpsState, f: WorkerForm, confirmNew = false): Result {
  const x = denied(d, "message", "register a worker"); if (x) return x;
  if (!f.name.trim()) return no("Enter the worker's full name.");
  if (!f.email.trim() && !f.mobile.trim()) return no("Enter an email or a mobile number.");
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return no("That email address doesn't look right.");
  if (!f.roles.length) return no("Choose at least one skill.");
  const { exact, similar } = findDuplicates(d, f);
  if (exact) return no("Already registered: " + exact.name + " (" + exact.id + ") has this " + (normEmail(exact.email) === normEmail(f.email) ? "email" : "mobile") + ".", { existing: exact.id });
  if (similar.length && !confirmNew) return no("A worker called " + similar[0].name + " already exists. Check it isn't the same person.", { similar: similar.map((w) => w.id) });
  const id = nextWorkerId(d);
  const w: Worker = {
    id, name: f.name.trim(), email: normEmail(f.email), mobile: f.mobile.trim(), area: f.area.trim() || "Dublin city", county: f.county || "Dublin",
    region: f.county === "Dublin" || !f.county ? "Dublin" : ["Cork", "Limerick", "Kerry", "Clare", "Waterford", "Tipperary"].includes(f.county) ? "Munster"
      : ["Galway", "Mayo", "Sligo", "Roscommon", "Leitrim"].includes(f.county) ? "Connacht" : ["Donegal", "Cavan", "Monaghan"].includes(f.county) ? "Ulster" : "Leinster",
    roles: f.roles, rtw: f.rtw, status: "pending_verification", joined: dayKey(d.clock), bullhornId: null, bullhornState: "not_linked",
    week: "???????", off: []
  };
  d.workers.push(w);
  post(d, { threadId: directThread(d, id).id, kind: "message", to: [id], body: "Welcome to OSS. Download the OSS Crew app to set your availability and upload your " + (needsRtw(f.rtw) ? "photo ID and work authorisation" : "photo ID") + "." });
  audit(d, "worker.registered", actorName(d) + " registered " + w.name + " (" + id + "); pending document verification", { type: "worker", id });
  return ok(w.name + " registered. They can't be booked until their documents are verified.", { id });
}
/** A new worker signs up in the crew app. They can't be booked until the office verifies their documents. */
export function selfRegister(d: OpsState, f: WorkerForm): Result {
  if (!f.name.trim()) return no("Enter your full name.");
  if (!f.mobile.trim()) return no("Enter your mobile number. We use it for shift messages.");
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return no("That email address doesn't look right.");
  if (!f.roles.length) return no("Choose at least one type of work.");
  const { exact } = findDuplicates(d, f);
  if (exact) return no("You're already registered with this " + (normEmail(exact.email) === normEmail(f.email) ? "email" : "mobile") + ". Contact the OSS office.", { existing: exact.id });
  const id = nextWorkerId(d);
  d.workers.push({ id, name: f.name.trim(), email: normEmail(f.email), mobile: f.mobile.trim(), area: f.area.trim() || "Not given", county: f.county || "Dublin",
    region: "Dublin", roles: f.roles, rtw: f.rtw, status: "pending_verification", joined: dayKey(d.clock), bullhornId: null, bullhornState: "not_linked", week: "???????", off: [] });
  post(d, { threadId: directThread(d, id).id, kind: "reply", to: ["office"], from: { kind: "worker", id }, body: "New sign-up from the crew app: " + f.name.trim() + " (" + f.roles.join(", ") + "). Documents to follow." });
  audit(d, "worker.self_registered", f.name.trim() + " signed up in the crew app (" + id + "); pending document verification", { type: "worker", id });
  return ok("Welcome to OSS. Next, add your availability and upload your documents.", { id });
}

export function updateWorker(d: OpsState, id: string, patch: Partial<Pick<Worker, "name" | "email" | "mobile" | "area" | "county" | "roles" | "rtw" | "note">>): Result {
  const self = actorId(d) === id;
  if (!self) { const x = denied(d, "message", "edit worker details"); if (x) return x; }
  const w = worker(d, id);
  if (patch.name !== undefined && !patch.name.trim()) return no("Name can't be empty.");
  if (patch.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.email.trim())) return no("That email address doesn't look right.");
  if (patch.roles && !patch.roles.length) return no("Keep at least one skill.");
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(w[k]));
  if (!changed.length) return ok("No changes.");
  Object.assign(w, patch);
  if (w.bullhornId) w.bullhornState = "pending";
  audit(d, "worker.updated", actorName(d) + " updated " + w.name + ": " + changed.join(", ") + (w.bullhornId ? "; queued for Bullhorn sync" : ""), { type: "worker", id });
  return ok("Saved." + (w.bullhornId ? " Bullhorn sync queued (simulated)." : ""));
}
export function setWeek(d: OpsState, id: string, week: string): Result {
  if (!/^[adex?]{7}$/.test(week)) return no("Availability needs a choice for every day.");
  if (actorId(d) !== id) { const x = denied(d, "message", "change availability"); if (x) return x; }
  const w = worker(d, id);
  const before = w.week; w.week = week;
  audit(d, "availability.week", actorName(d) + " updated " + w.name + "'s weekly availability", { type: "worker", id });
  return ok(before === week ? "No changes." : "Availability saved. Confirmed shifts are not affected.");
}
export function addOff(d: OpsState, id: string, from: string, to: string, note: string): Result {
  if (!from || !to) return no("Choose the first and last day.");
  if (to < from) return no("The last day is before the first day.");
  if (actorId(d) !== id) { const x = denied(d, "message", "change availability"); if (x) return x; }
  const w = worker(d, id);
  w.off.push({ id: nid(d, "OFF"), from, to, note: note.trim() || "Unavailable" });
  w.off.sort((a, b) => a.from.localeCompare(b.from));
  audit(d, "availability.off", w.name + " unavailable " + fmtDay(from) + (to !== from ? " to " + fmtDay(to) : ""), { type: "worker", id });
  return ok("Saved. Existing bookings on those days are unchanged; talk to the office to swap them.");
}
export function removeOff(d: OpsState, id: string, offId: string): Result {
  if (actorId(d) !== id) { const x = denied(d, "message", "change availability"); if (x) return x; }
  const w = worker(d, id);
  w.off = w.off.filter((o) => o.id !== offId);
  audit(d, "availability.off_removed", w.name + " removed an unavailable period", { type: "worker", id });
  return ok("Removed.");
}

/* ── documents ──────────────────────────────────────────────────────────── */
export interface DocForm { type: DocType; issued: string; expires: string; ref?: string; fileName?: string }
export function uploadDoc(d: OpsState, workerId: string, f: DocForm): Result {
  const by = actorId(d);
  if (by !== workerId) { const x = denied(d, "message", "upload a document"); if (x) return x; }
  if (!f.issued) return no("Enter the issue date.");
  if (!f.expires) return no("Enter the expiry date.");
  if (f.expires <= f.issued) return no("The expiry date must be after the issue date.");
  if (f.expires < dayKey(d.clock)) return no("This document has already expired. Upload the renewed one.");
  const w = worker(d, workerId);
  const id = nid(d, "D");
  d.docs.push({ id, workerId, type: f.type, name: f.type === "RTW" ? "IRP card (" + w.rtw + ")" : DOC_LABEL[f.type], ref: f.ref?.trim() ? "•••• " + f.ref.trim().slice(-4) : "•••• " + id.slice(-4),
    issued: f.issued, expires: f.expires, status: "pending", file: f.fileName || "photo-" + id.toLowerCase() + ".jpg", uploadedAt: d.clock, uploadedBy: by });
  audit(d, "document.uploaded", actorName(d) + " uploaded " + w.name + "'s " + DOC_LABEL[f.type] + " (expires " + fmtDay(f.expires) + "); awaiting verification", { type: "document", id });
  if (isWorker(by)) post(d, { threadId: directThread(d, workerId).id, kind: "reply", to: ["office"], from: { kind: "worker", id: workerId }, body: "Uploaded a new " + DOC_LABEL[f.type].toLowerCase() + " for checking." });
  return ok("Uploaded. The office will verify it; until then it doesn't count.", { id });
}
export function verifyDoc(d: OpsState, docId: string, accept: boolean, note = ""): Result {
  const x = denied(d, "verify_docs", "verify documents"); if (x) return x;
  const doc = docById(d, docId);
  if (!doc || doc.status !== "pending") return no("Only a document awaiting verification can be decided.");
  if (!accept && !note.trim()) return no("Say why it's rejected so the worker can fix it.");
  doc.status = accept ? "verified" : "rejected"; doc.verifiedBy = actorId(d); doc.verifiedAt = d.clock; doc.note = note.trim() || undefined;
  const w = worker(d, doc.workerId);
  let activated = false;
  if (accept && w.status === "pending_verification" && mandatoryTypes(w).every((t) => ["valid", "expiring"].includes(docState(d, w.id, t).state))) {
    w.status = "active"; activated = true;
  }
  post(d, { threadId: directThread(d, w.id).id, kind: "message", to: [w.id], body: accept
    ? "Your " + DOC_LABEL[doc.type].toLowerCase() + " is verified." + (activated ? " You can now be booked on shifts." : "")
    : "Your " + DOC_LABEL[doc.type].toLowerCase() + " couldn't be accepted: " + note.trim() + ". Please upload a new copy." });
  audit(d, "document." + (accept ? "verified" : "rejected"), actorName(d) + (accept ? " verified " : " rejected ") + w.name + "'s " + DOC_LABEL[doc.type] + (note ? " (" + note.trim() + ")" : "") + (activated ? "; worker now active" : ""), { type: "document", id: doc.id });
  return ok(accept ? "Verified." + (activated ? " " + w.name + " can now be booked." : "") : "Rejected. " + w.name + " has been asked for a new copy.");
}
export function activateWorker(d: OpsState, id: string): Result {
  const x = denied(d, "verify_docs", "activate a worker"); if (x) return x;
  const w = worker(d, id);
  const missing = mandatoryTypes(w).filter((t) => !["valid", "expiring"].includes(docState(d, id, t).state));
  if (missing.length) return no("Verify " + missing.map((t) => DOC_LABEL[t].toLowerCase()).join(" and ") + " first.");
  w.status = "active";
  audit(d, "worker.activated", actorName(d) + " activated " + w.name, { type: "worker", id });
  return ok(w.name + " is active.");
}

/** A supervisor registers a walk-in worker on site. Registration is not verification. */
export function registerEmergency(d: OpsState, f: { name: string; mobile: string; role: string; rtw: Rtw; idPhoto: boolean }, eventId: string | null): Result {
  const x = denied(d, "supervise", "register an emergency worker"); if (x) return x;
  if (!f.name.trim() || !f.mobile.trim()) return no("Enter a name and mobile number.");
  const { exact } = findDuplicates(d, { name: f.name, email: "", mobile: f.mobile });
  if (exact) return no(exact.name + " is already registered (" + exact.id + "). Ask the office to offer them the shift.", { existing: exact.id });
  const id = nextWorkerId(d);
  d.workers.push({ id, name: f.name.trim(), email: "", mobile: f.mobile.trim(), area: "Not recorded", county: "Dublin", region: "Dublin", roles: [f.role], rtw: f.rtw,
    status: "pending_verification", joined: dayKey(d.clock), bullhornId: null, bullhornState: "not_linked", week: "???????", off: [],
    emergency: { by: actorId(d), at: d.clock, eventId } });
  if (f.idPhoto) d.docs.push({ id: nid(d, "D"), workerId: id, type: "ID", name: "Photo ID (taken on site)", ref: "•••• on site", issued: dayKey(d.clock),
    expires: String(Number(dayKey(d.clock).slice(0, 4)) + 5) + dayKey(d.clock).slice(4), status: "pending", file: "onsite-id-" + id.toLowerCase() + ".jpg", uploadedAt: d.clock, uploadedBy: actorId(d) });
  post(d, { threadId: directThread(d, id).id, kind: "reply", to: ["office"], from: { kind: "supervisor", id: actorId(d) },
    body: "Emergency registration on site: " + f.name.trim() + " (" + f.role + "). Please verify ID" + (needsRtw(f.rtw) ? " and work authorisation" : "") + " before they start." });
  audit(d, "worker.emergency", actorName(d) + " registered " + f.name.trim() + " on site (" + id + "); not verified, cannot be booked or clock in until the office verifies", { type: "worker", id });
  return ok("Registered. The office has been asked to verify " + f.name.trim() + "; they can't clock in until then.", { id });
}
