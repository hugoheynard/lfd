import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";

/** Une image de la médiathèque remplacée par une autre, signée de qui et quand. */
export interface StorefrontImageChange {
  readonly from: string;
  readonly to: string;
  /** La fiche INTERNE du staff — le verrou de la vitrine l'inscrit. */
  readonly staffId: string;
  readonly at: Date;
}

/**
 * **Repointer une image dans la vitrine** — le pendant d'écriture de
 * {@link StorefrontMediaUsage}, publié par le même canal (L7 du plan
 * `documentation/mediatheque/plan-la-mediatheque-amelioree.md`, 2026-10-10).
 *
 * Deux ports et pas un (ISP) : compter les emplois sert au ramassage et au
 * retrait, qui n'ont rien à faire d'un port capable de réécrire la vitrine.
 *
 * 🔴 Il passe par l'AGRÉGAT, pas par un `UPDATE` de colonnes : la vitrine
 * s'enregistre sous un verrou de révision (D6 du plan de la vitrine). Un
 * repointage qui ne monterait pas la révision laisserait un éditeur ouvert
 * avant lui réenregistrer l'ancienne image sans être refusé.
 *
 * Exige le laissez-passer du journal : c'est l'appelant (la médiathèque) qui
 * trace le remplacement — la vitrine n'inscrit pas de `storefront.saved` en
 * plus, le geste n'est pas le sien.
 */
export abstract class StorefrontImageRepointing {
  /**
   * Remplace `from` par `to` dans les objets VIVANTS et sur la porte de
   * l'accueil, dans la transaction ambiante. Rend combien de porteurs ont
   * changé (un objet compte une fois, la porte aussi) ; zéro n'écrit rien et
   * ne monte pas la révision.
   */
  abstract repoint(change: StorefrontImageChange, ticket: WriteTicket): Promise<number>;
}
