import type { ResupplyTarget, SiteResupply } from "./site-resupply.js";

/**
 * Port d'**écriture** du réassort : l'agrégat entier, chargé puis rendu.
 * `load` porte le point dans sa clé — le mur par point : un identifiant d'un
 * autre point rend `null`. `save` refuse d'écraser un réassort modifié
 * entre-temps (`SiteResupplyChangedMeanwhileError`), et une seconde demande
 * ouverte pour la même visée (`SiteResupplyDraftOpenedMeanwhileError`).
 */
export abstract class SiteResupplyRepository {
  abstract load(siteId: string, resupplyId: string): Promise<SiteResupply | null>;

  /**
   * Plusieurs réassorts du point en une lecture (M6) ; ceux d'un autre point,
   * ou introuvables, sont absents de la réponse.
   */
  abstract loadMany(
    siteId: string,
    resupplyIds: readonly string[],
  ): Promise<readonly SiteResupply[]>;

  /** La demande en cours (brouillon) du point pour cette visée et cette journée, s'il y en a une. */
  abstract openDraft(
    siteId: string,
    target: ResupplyTarget,
    serviceDay: string,
  ): Promise<SiteResupply | null>;

  abstract save(resupply: SiteResupply): Promise<void>;
}
