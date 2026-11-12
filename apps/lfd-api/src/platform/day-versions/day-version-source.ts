import type { DayJournal, StaffPermission } from "@lfd/contracts";

import { DAY_VERSIONS_FRESH_MS } from "./day-versions-card.js";

/**
 * **Une source de version de journée** — ce que la porte des versions demande
 * à chaque bloc qui tient un journal de journée
 * (`documentation/caching-usage/version-par-journee.md`, D8 ;
 * `plan-veilleur-unique.md`, § 3.1 : la portée `day`).
 *
 * `platform` DÉCLARE ce port et ne connaît aucun bloc : le commerce, le fournil
 * et la livraison l'IMPLÉMENTENT chacun dans leur propre code, et
 * `appBootstrap/day-version-sources.module.ts` les relie en un registre. La
 * porte ne lit donc aucune table : elle pose la question à qui la possède.
 *
 * Le droit vit AVEC la source, pas dans la porte : une version n'est rendue
 * qu'à qui tient l'une des permissions de {@link readers}.
 */
export abstract class DayVersionSource {
  /** Le nom du journal sur le fil — un seul fournisseur par nom (le registre y veille). */
  abstract readonly journal: DayJournal;

  /** L'une suffit. Jamais vide : une source sans droit serait ouverte à tout le staff. */
  abstract readonly readers: readonly [StaffPermission, ...StaffPermission[]];

  /** La fenêtre pendant laquelle un numéro rangé se sert sans relire la base. */
  readonly freshMs: number = DAY_VERSIONS_FRESH_MS;

  /**
   * La version de la journée `AAAA-MM-JJ` dans ce journal, `0` si aucune trace.
   * Opaque : elle se compare par égalité, jamais par ordre.
   *
   * @throws {DomainError} la journée n'existe pas au calendrier.
   */
  abstract versionOf(serviceDay: string): Promise<number>;
}
