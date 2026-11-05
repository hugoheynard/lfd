import type { AdminDeliveryZoneView } from "@lfd/contracts";

/**
 * Port de **lecture** des zones AVEC leurs remplacements par audience (plan
 * `plan-livraison-offerte.md`, 0b). Distinct de `DeliveryZoneRepository` (ISP) :
 * le calcul du frais et l'écran du staff lisent les remplacements, la route
 * publique ne les sert pas (0c).
 */
export abstract class DeliveryZoneTermsReader {
  /** Toutes les zones, rangées par libellé. */
  abstract list(): Promise<readonly AdminDeliveryZoneView[]>;
}
