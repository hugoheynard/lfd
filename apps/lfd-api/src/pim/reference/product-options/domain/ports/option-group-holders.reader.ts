/**
 * **Les fiches qui activent un groupe** — ce que le référentiel des options
 * demande au catalogue : réémettre les fiches qu'une révision, une archive ou
 * une restauration touche, et compter, sur la liste, ce qui l'active.
 *
 * Déclaré ici, implémenté par le catalogue (la fiche écrit son activation),
 * relié par la racine (`appBootstrap/option-group-holders-feed.module.ts`) :
 * le catalogue lit déjà ce référentiel, l'inverse ferait un cycle.
 */
export abstract class OptionGroupHoldersReader {
  /** Les fiches où le groupe est actif (activation non retirée), archivées comprises. */
  abstract productsHolding(groupId: string): Promise<readonly string[]>;

  /** Groupe → nombre de fiches où il est actif ; un groupe absent n'en a aucune. */
  abstract countByGroup(): Promise<ReadonlyMap<string, number>>;
}
