import type {
  CustomerAudience,
  GpsPoint,
  PickupAddressPayload,
  PickupAddressView,
} from "@lfd/contracts";

import type { PickupDiscount } from "./pickup-discount.js";

/**
 * Ce qu'on écrit d'un point : ses champs, et sa remise **déjà validée** —
 * la charge des faits `pickup_address.created` / `updated`.
 *
 * La remise est un {@link PickupDiscount} et non les deux champs du contrat :
 * une réduction qui ne vise aucune clientèle ne peut donc pas l'atteindre.
 */
export type PickupAddressWrite = Omit<
  PickupAddressPayload,
  "discount" | "discountAudiences" | "gps"
> & {
  readonly discount: PickupDiscount;
  /** Résolu par le handler : jamais « absent » une fois arrivé ici. */
  readonly gps: GpsPoint | null;
};

/**
 * **Les points de retrait tels que le client les voit** — les sites ACTIFS qui
 * REMETTENT des commandes (plan des sites, §3.1, lot S1, 2026-10-13).
 *
 * Un port de lecture seulement depuis le lot S1 : l'écriture est celle de
 * l'agrégat `Site` (`b2b/sites/`), qui porte désormais les invariants que ce
 * repository tenait. Un site archivé, ou qui ne remet pas, n'est ni listé ni
 * résolu : il ne se choisit plus. Il n'y a plus de point « par défaut »
 * (Hugo, 2026-10-15) : la présélection se décide par client
 * (`preselectedPickupId`).
 *
 * Le nom reste celui d'août : checkout, remise, heures limites et abonnements
 * le lisent, et ce lot ne les renomme pas.
 */
export abstract class PickupAddressRepository {
  /**
   * Les points proposés, par ancienneté — à **cette clientèle** seulement
   * (filtré en base : un choix commercial, Hugo 2026-10-15), ou à toutes avec
   * `null` (l'équipe, qui voit tous les comptoirs).
   */
  abstract list(audience: CustomerAudience | null): Promise<readonly PickupAddressView[]>;

  /**
   * Le point proposé d'identifiant `id`, quelle que soit sa clientèle ; `null`
   * s'il n'existe pas, est archivé ou ne remet pas. Le refus par clientèle est
   * celui de la caisse (`CartAdjustments.forPickup`), qui le nomme.
   */
  abstract resolve(id: string): Promise<PickupAddressView | null>;
}
