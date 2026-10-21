import type { SiteResupply } from "./site-resupply.js";

/**
 * Port d'**écriture** du réassort : l'agrégat entier, chargé puis rendu.
 * `load` porte le point dans sa clé — le mur par point : un identifiant d'un
 * autre point rend `null`. `save` refuse d'écraser un réassort modifié
 * entre-temps (`SiteResupplyChangedMeanwhileError`).
 */
export abstract class SiteResupplyRepository {
  abstract load(siteId: string, resupplyId: string): Promise<SiteResupply | null>;

  abstract save(resupply: SiteResupply): Promise<void>;
}
