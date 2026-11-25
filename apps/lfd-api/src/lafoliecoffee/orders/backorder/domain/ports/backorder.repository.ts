import type { Backorder } from "../entities/backorder.js";

/**
 * Port d'**écriture** du reliquat de commande (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 2) : il
 * prend et rend l'agrégat. Les lectures de l'écran (la liste, la fiche) sont
 * d'autres ports.
 *
 * Le reliquat se lit par l'équipe seule : un reliquat de pro porte sa société,
 * un reliquat de particulier n'en a pas ; aucune route client ne l'atteint.
 */
export abstract class BackorderRepository {
  /** `null` : reliquat inconnu. Sans verrou. */
  abstract load(id: string): Promise<Backorder | null>;

  /**
   * Le reliquat sous verrou de ligne (`SELECT … FOR UPDATE`), dans l'unité de
   * travail de l'appelant : deux transformations concurrentes se suivent, la
   * seconde lit l'état fermé. `null` : reliquat inconnu.
   */
  abstract loadLocked(id: string): Promise<Backorder | null>;

  /**
   * Le reliquat d'une commande d'origine, sous verrou de ligne, dans l'unité
   * de travail de l'appelant — l'annulation de l'origine, qui tient déjà le
   * verrou de la commande. `null` : la commande n'a pas de reliquat.
   */
  abstract loadLockedByOrigin(originOrderId: string): Promise<Backorder | null>;

  /**
   * Écrit le reliquat : l'insère à sa naissance, réécrit son sort ensuite.
   * L'unicité par commande d'origine refuse un second reliquat en base.
   */
  abstract save(backorder: Backorder): Promise<void>;
}
