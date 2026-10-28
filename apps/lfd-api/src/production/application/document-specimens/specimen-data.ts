import { addDays, instantToLocal } from "@lfd/contracts";

import type { ProductionOrderSnapshot } from "../../domain/entities/production-day.js";

/**
 * **Les données d'exemple de la fiche d'atelier** — la planche des documents
 * de la Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Elles ne sont JAMAIS persistées** : aucune journée ne les porte, aucun
 * dépôt ne les reçoit, la fiche rendue n'est pas archivée.
 *
 * Ce sont les articles du bon d'exemple du commerce, recopiés et non importés :
 * le fournil ne lit pas le commerce (`CLAUDE.md` §3). Si l'un change, l'autre
 * se met à jour à la main — c'est une planche, pas un contrat.
 */
export const SPECIMEN_ORDER: ProductionOrderSnapshot = {
  packed: null,
  orderId: "specimen-order",
  rank: 1,
  reference: "EXEMPLE-0001",
  customerLabel: "EXEMPLE — Hôtel des Trois Ponts",
  fulfillmentMethod: "delivery",
  destination: "EXEMPLE — 1 rue des Trois Ponts, 73150 Val d'Isère",
  dueAt: "07:00",
  clientele: "pro",
  siteId: null,
  lines: [
    { sku: "EXEMPLE-BAG", productName: "Baguette tradition", quantity: 40, saleUnit: "piece" },
    { sku: "EXEMPLE-CRO", productName: "Croissant pur beurre", quantity: 60, saleUnit: "piece" },
    { sku: "EXEMPLE-PAC", productName: "Pain au chocolat", quantity: 30, saleUnit: "piece" },
    { sku: "EXEMPLE-TAS", productName: "Tasse La Folie Coffee", quantity: 2, saleUnit: "piece" },
    // Un article au poids sur la planche (P6 de `pricing/plan-vente-au-poids.md`) :
    // « 1,25 kg » doit se lire sur la fiche, le compte et le dossier.
    { sku: "EXEMPLE-SAU", productName: "Saumon gravlax", quantity: 1250, saleUnit: "weight" },
  ],
  sheetDetails: null,
};

/** La journée de service de l'exemple : le lendemain de `now`, à Paris. */
export function specimenServiceDay(now: Date): string {
  return addDays(instantToLocal(now).day, 1);
}
