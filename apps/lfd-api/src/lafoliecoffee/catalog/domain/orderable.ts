import type { CatalogReservationMark } from "./served-to-viewer.js";
import type { MenuMark } from "./sub-account-menu-verdict.js";

/** Les deux marques qu'un article rendu porte pour son lecteur. */
export interface OrderabilityMarks {
  readonly reservation: CatalogReservationMark;
  readonly menu: MenuMark;
}

/**
 * Pourquoi un article rendu n'est pas commandable par ce lecteur, ou `null`
 * — la réservation d'abord (elle se dit déjà par son nom), puis la carte du
 * sous-compte (`carte-des-sites.md`, § 3.4).
 */
export type UnorderableCause = "reserved_elsewhere" | "off_menu";

/**
 * **La seule lecture des marques** (§ 3.4) : un article verrouillé sort du
 * lecteur comme un article résolu, et c'est sa marque qui dit qu'il ne se
 * commande pas. `lint:orderable-door` refuse une comparaison à `"other"`
 * hors de ce fichier — un neuvième lecteur ne peut pas oublier la carte.
 */
export function unorderableCause(item: OrderabilityMarks): UnorderableCause | null {
  if (item.reservation === "other") {
    return "reserved_elsewhere";
  }
  return item.menu === "off" ? "off_menu" : null;
}

/** L'article se commande-t-il ? Ni réservé ailleurs, ni hors carte. */
export function isOrderable(item: OrderabilityMarks): boolean {
  return unorderableCause(item) === null;
}

/**
 * **Réservé à un autre compte**, et seulement cela — pour les écrans du
 * personnel qui tarifent un compte (grille, mercuriale) : la carte n'y
 * retire rien, un prix négocié sur un article hors carte doit survivre à un
 * changement de carte (§ 3.6).
 */
export function isReservedElsewhere(item: Pick<OrderabilityMarks, "reservation">): boolean {
  return item.reservation === "other";
}
