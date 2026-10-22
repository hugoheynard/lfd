import type { SiteResupplyDraftView, SiteResupplyView } from "@lfd/contracts";

import type { PlacedSiteResupplySnapshot, SiteResupplySnapshot } from "../domain/site-resupply.js";

/** Un auteur que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas. */
function nameOf(name: string): string | null {
  return name === "" ? null : name;
}

/** Le réassort envoyé tel que les écrans le lisent. */
export function siteResupplyView(snapshot: PlacedSiteResupplySnapshot): SiteResupplyView {
  return {
    id: snapshot.id,
    siteId: snapshot.siteId,
    serviceDay: snapshot.serviceDay,
    target: snapshot.target,
    origin: snapshot.origin,
    name: snapshot.name,
    status: snapshot.cancelled === null ? "placed" : "cancelled",
    lines: snapshot.lines.map((line) => ({
      sku: line.sku,
      label: line.label,
      quantity: line.quantity,
    })),
    placedAt: snapshot.placed.at.toISOString(),
    placedBy: nameOf(snapshot.placed.author.name),
    cancelledAt: snapshot.cancelled?.at.toISOString() ?? null,
    cancelledBy: snapshot.cancelled === null ? null : nameOf(snapshot.cancelled.author.name),
    arrivedAt: snapshot.arrived?.at.toISOString() ?? null,
    arrivedBy: snapshot.arrived === null ? null : nameOf(snapshot.arrived.author.name),
    launchedAt: snapshot.launched?.at.toISOString() ?? null,
    launchedBy: snapshot.launched?.byName ?? null,
    departedAt: snapshot.departed?.at.toISOString() ?? null,
    departedBy: snapshot.departed?.byName ?? null,
  };
}

/** La demande en cours telle que le comptoir la remplit. */
export function siteResupplyDraftView(snapshot: SiteResupplySnapshot): SiteResupplyDraftView {
  return {
    id: snapshot.id,
    target: snapshot.target,
    serviceDay: snapshot.serviceDay,
    version: snapshot.version,
    name: snapshot.name,
    lines: snapshot.lines.map((line) => ({
      sku: line.sku,
      label: line.label,
      quantity: line.quantity,
    })),
  };
}
