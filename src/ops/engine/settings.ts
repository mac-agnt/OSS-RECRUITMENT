/* Rules the office can change. Every derived number recalculates from them. */

import type { DocType, OpsState, Result, Rules } from "../model";
import { actorName, audit, denied, no, ok } from "./core";

type NumKey = { [K in keyof Rules]: Rules[K] extends number ? K : never }[keyof Rules];
const RANGE: Partial<Record<NumKey, [number, number, string]>> = {
  radiusM: [10, 1000, "m"], clockOpenMin: [0, 240, "min"], minimumMin: [0, 600, "min"], breakAfterMin: [60, 720, "min"], breakMin: [0, 120, "min"],
  otDailyMin: [0, 960, "min"], reconfirmH: [1, 72, "h"], travelH: [1, 12, "h"], noReplyMin: [10, 240, "min"], offerExpiryH: [1, 168, "h"],
  missedOutMin: [5, 240, "min"], travelBufferMin: [0, 240, "min"], stamp2WeekMin: [0, 3600, "min"], stamp2HolidayMin: [0, 3600, "min"],
  weekWarnMin: [600, 4800, "min"], expiryWarnDays: [1, 180, "days"]
};
export function setRule(d: OpsState, key: keyof Rules, value: number | boolean | number[]): Result {
  const x = denied(d, "approve_hours", "change rules"); if (x) return x;
  const before = JSON.stringify(d.rules[key]);
  if (typeof value === "number") {
    const r = RANGE[key as NumKey];
    if (!Number.isFinite(value)) return no("Enter a number.");
    if (r && (value < r[0] || value > r[1])) return no("Must be between " + r[0] + " and " + r[1] + " " + r[2] + ".");
  }
  if (Array.isArray(value) && value.some((n) => !(n > 0 && n <= 365))) return no("Reminder days must be between 1 and 365.");
  (d.rules as unknown as Record<string, unknown>)[key] = value;
  audit(d, "rule.changed", actorName(d) + " changed " + key + " from " + before + " to " + JSON.stringify(value));
  return ok("Rule saved. Numbers recalculate straight away.");
}
export function setRate(d: OpsState, role: string, rate: number): Result {
  const x = denied(d, "payroll", "change pay rates"); if (x) return x;
  if (!(rate >= 10 && rate <= 100)) return no("Enter an hourly rate between €10 and €100.");
  const before = d.rules.rates[role];
  d.rules.rates = { ...d.rules.rates, [role]: Math.round(rate * 100) / 100 };
  audit(d, "rule.rate", actorName(d) + " changed the " + role + " rate from €" + before + " to €" + rate.toFixed(2));
  return ok("Rate saved.");
}
export function setRoleQuals(d: OpsState, role: string, quals: DocType[]): Result {
  const x = denied(d, "approve_hours", "change role requirements"); if (x) return x;
  d.rules.roleQuals = { ...d.rules.roleQuals, [role]: quals };
  audit(d, "rule.role_quals", actorName(d) + " set " + role + " requirements to " + (quals.join(", ") || "none"));
  return ok("Saved.");
}
export function setCrowd(d: OpsState, on: boolean): Result {
  d.ui.crowd = on;
  audit(d, "demo.crowd", "Simulated crew activity " + (on ? "on" : "off"), undefined, true);
  return ok(on ? "Simulated crew will reply and clock in as demo time moves." : "Only the phone personas will act now.");
}
