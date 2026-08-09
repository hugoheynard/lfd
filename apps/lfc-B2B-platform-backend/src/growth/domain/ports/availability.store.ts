import type { AvailabilityConfigPayload, BookingPolicy } from "@lfd/contracts";

import type { AvailabilityConfig } from "../availability.js";

/**
 * Port de la **disponibilité déclarée** (règles + exceptions + politique).
 *
 * Surface volontairement minuscule : la disponibilité s'écrit **en bloc**
 * (`replace`), pas ligne par ligne. C'est le geste réel du commercial — il édite
 * sa grille et enregistre — et ça épargne une API CRUD de trois entités dont
 * personne n'a besoin.
 */
export abstract class AvailabilityStore {
  /** La configuration courante, telle que la lit `slotsFor`. */
  abstract load(): Promise<AvailabilityConfig>;

  /**
   * Remplace **atomiquement** règles, exceptions et politique. Rend la
   * configuration relue, pour que l'appelant réponde ce qui est réellement en base.
   */
  abstract replace(config: AvailabilityConfigPayload): Promise<AvailabilityConfig>;

  /**
   * Écrit **la seule politique**, sans toucher aux règles ni aux exceptions.
   *
   * Surface distincte de `replace` et non un `replace` partiel : les bornes de
   * réservation se règlent sans rouvrir la grille, et un écran qui n'édite que
   * celles-là ne doit pas pouvoir en écraser une autre au passage.
   */
  abstract savePolicy(policy: BookingPolicy): Promise<AvailabilityConfig>;
}
