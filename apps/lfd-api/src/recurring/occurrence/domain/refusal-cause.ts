/**
 * Les causes stables d'une échéance non passée. Le code se lit par machine
 * (« même cause qu'au passage précédent ? ») ; la phrase, par le staff.
 */
export type OccurrenceRefusalCause =
  | "buyer_left"
  | "deadline_closed"
  | "item_limit_exceeded"
  | "reserved_elsewhere"
  | "unavailable_sku"
  | "day_closed"
  | "plan_closed"
  | "no_settlement"
  | "shop_closed"
  /** Un autre refus métier de la passation : sa phrase dit le cas. */
  | "order_refused";

/** Toutes les causes, pour relire une colonne écrite. */
export const OCCURRENCE_REFUSAL_CAUSES: readonly OccurrenceRefusalCause[] = [
  "buyer_left",
  "deadline_closed",
  "item_limit_exceeded",
  "reserved_elsewhere",
  "unavailable_sku",
  "day_closed",
  "plan_closed",
  "no_settlement",
  "shop_closed",
  "order_refused",
];
