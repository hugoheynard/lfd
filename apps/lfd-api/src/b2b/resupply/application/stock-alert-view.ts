import type { StockAlertView } from "@lfd/contracts";

import type { StockAlertSnapshot } from "../domain/stock-alert.js";

/** L'alerte telle que les écrans la lisent ; un auteur sans nom n'en reçoit pas d'inventé. */
export function stockAlertView(snapshot: StockAlertSnapshot): StockAlertView {
  const name = snapshot.declared.author.name;
  return {
    id: snapshot.id,
    siteId: snapshot.siteId,
    sku: snapshot.sku,
    label: snapshot.label,
    level: snapshot.level,
    declaredAt: snapshot.declared.at.toISOString(),
    declaredBy: name === "" ? null : name,
  };
}
