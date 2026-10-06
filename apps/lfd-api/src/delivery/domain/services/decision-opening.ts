import type { DeliveryIncidentFamily } from "@lfd/contracts";

/**
 * **Les motifs qui ouvrent une décision du commercial**
 * (`documentation/livraisons/a-la-porte.md`, § 9, § 10 B3) : le client ne
 * respecte pas les conditions convenues — personne pour réceptionner, refus,
 * accès impossible. Ce n'est pas au livreur de trancher (Hugo, 2026-10-01).
 *
 * ⚠️ « Dépôt interdit », cité par le plan, n'est pas un motif de
 * `DELIVERY_INCIDENT_REASONS` (relu le 2026-10-01) : il qualifie « personne »
 * à une adresse qui n'autorise pas le dépôt — le cas même que la décision
 * règle. Adresse introuvable, marchandise abîmée et « autre » n'en ouvrent
 * pas : ce sont des problèmes du livreur ou du produit, pas du client.
 */
export const DECISION_OPENING_REASONS: readonly string[] = [
  "nobody_present",
  "refused",
  "access_impossible",
];

/** Ce signalement ouvre-t-il une décision ? Seulement à la remise, et pour ces motifs. */
export function opensDecision(family: DeliveryIncidentFamily, reason: string): boolean {
  return family === "doorstep" && DECISION_OPENING_REASONS.includes(reason);
}
