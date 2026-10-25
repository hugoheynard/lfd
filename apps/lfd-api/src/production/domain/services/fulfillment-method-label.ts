import type { ProductionOrderSnapshot } from "../entities/production-day.js";

/** « Retrait » / « Livraison », en un mot — le fournil charge, il ne facture pas. */
export function methodLabel(method: "pickup" | "delivery"): string {
  return method === "pickup" ? "Retrait" : "Livraison";
}

const CLIENTELE_LABELS = { pro: "pro", public: "particulier" } as const;

/**
 * « Retrait Village · pro », « Livraison · particulier » — l'acheminement,
 * le site qui remet et la clientèle, en une ligne (Hugo, 2026-10-25). Le site
 * est le point nommé figé à l'arrêt, sinon la destination en une ligne ; une
 * part inconnue (journée d'avant la colonne, destination vide) est OMISE,
 * jamais devinée : « Retrait » seul reste vrai.
 */
export function fulfillmentLabelOf(
  order: Pick<
    ProductionOrderSnapshot,
    "fulfillmentMethod" | "clientele" | "destination" | "sheetDetails"
  >,
): string {
  const site =
    order.fulfillmentMethod === "pickup"
      ? (order.sheetDetails?.pickupLabel ?? order.destination)
      : "";
  const method = site === "" ? methodLabel(order.fulfillmentMethod) : `Retrait ${site}`;
  return order.clientele === null ? method : `${method} · ${CLIENTELE_LABELS[order.clientele]}`;
}
