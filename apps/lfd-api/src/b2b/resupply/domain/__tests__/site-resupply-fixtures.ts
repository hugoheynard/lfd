import { SiteResupply } from "../site-resupply.js";
import { SiteResupplyLine } from "../site-resupply-line.js";

/** 17 h à Paris, le 2 janvier (heure d'hiver) : seules des dates comparées entre elles. */
export const EVENING = new Date("2026-01-02T16:00:00Z");
/** 23 h 30 à Paris le 2 janvier : après la limite, encore le même jour. */
export const LATE_NIGHT = new Date("2026-01-02T22:30:00Z");
/** 0 h 30 à Paris le 3 janvier, mais encore le 2 en UTC : la journée suit Paris. */
export const AFTER_MIDNIGHT = new Date("2026-01-02T23:30:00Z");
/** L'heure limite de demain : 18 h à Paris le 2 janvier. */
export const DEADLINE = new Date("2026-01-02T17:00:00Z");

export const AUTHOR = { staffUserId: "staff_1", name: "Lou", role: "counter" };

export function trace(at: Date) {
  return { at, author: AUTHOR };
}

export function line(sku: string, quantity: number): SiteResupplyLine {
  return SiteResupplyLine.of({ sku, label: `Article ${sku}`, quantity, saleUnit: "piece" });
}

export function draft(target: "tomorrow" | "asap", at = EVENING): SiteResupply {
  const resupply = SiteResupply.draft({ id: "rs1", siteId: "site_1", target, at });
  resupply.addLine(line("CRO", 12));
  return resupply;
}
