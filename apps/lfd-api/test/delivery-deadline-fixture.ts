/**
 * Le `fulfillment` d'une livraison écrite en base par une suite : la colonne
 * `fulfillment_method` vaut `delivery` par défaut, et une livraison hors
 * brouillon porte son échéance (CHECK `orders_delivery_has_deadline`,
 * 2026-10-25). L'échéance la plus tardive possible, pour ne contraindre que
 * ce qu'une suite éprouve explicitement — la forme de `delivery-routing-scene.ts`.
 */
export const LATEST_DELIVERY_FULFILLMENT = {
  window: { value: { start: null, end: "23:59" }, source: "default" },
  contact: { value: null, source: "default" },
  signatureRequired: { value: false, source: "default" },
} as const;
