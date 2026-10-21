import type { SiteResupplyView } from "@lfd/contracts";

import type { SiteResupplySnapshot } from "../domain/site-resupply.js";

/** Un auteur que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas. */
function nameOf(name: string): string | null {
  return name === "" ? null : name;
}

/** Le réassort tel que les écrans le lisent. */
export function siteResupplyView(snapshot: SiteResupplySnapshot): SiteResupplyView {
  return {
    id: snapshot.id,
    siteId: snapshot.siteId,
    serviceDay: snapshot.serviceDay,
    target: snapshot.target,
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
  };
}
