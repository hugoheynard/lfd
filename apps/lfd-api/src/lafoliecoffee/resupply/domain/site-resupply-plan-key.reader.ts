import type { ResupplyTarget } from "./site-resupply-snapshot.js";

/** Ce qui désigne la journée du fournil qu'un réassort concerne : immuable dès sa création. */
export interface SiteResupplyPlanKey {
  readonly target: ResupplyTarget;
  readonly serviceDay: string;
}

/**
 * Port de **lecture** de la clé de plan d'un réassort — sa visée et sa
 * journée, sans l'agrégat (2026-11-02). Il sert à prendre le verrou de la
 * journée AVANT de charger l'agrégat : la clé est immuable (`readonly` dans
 * `SiteResupply`), la lire hors verrou ne peut pas la rendre fausse, et
 * l'agrégat, lui, est chargé sous le verrou.
 *
 * Le mur par point est dans la clé : un identifiant d'un autre point rend `null`.
 */
export abstract class SiteResupplyPlanKeyReader {
  abstract keyOf(siteId: string, resupplyId: string): Promise<SiteResupplyPlanKey | null>;
}
