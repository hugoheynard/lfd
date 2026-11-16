import type { WorkstationMap } from "../entities/workstation-map.js";

/** Qui écrit, et quand : figé sur chaque ligne que le geste touche. */
export interface WorkstationMapStamp {
  readonly at: Date;
  readonly staffUserId: string;
  /** `null` : la fiche ne portait pas de nom au moment du geste — on n'en invente pas. */
  readonly name: string | null;
}

/**
 * Port d'**écriture** de la carte des postes (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.3) : la carte se charge entière
 * — une dizaine de postes, quelques centaines de produits — et se sauve par
 * sa différence (`WorkstationMap.changes`).
 *
 * Le chargement se fait DANS l'unité de travail et y verrouille la carte :
 * deux gestes concurrents se suivent, et les trois règles de l'agrégat se
 * jugent sur un état que personne n'écrit en même temps.
 */
export abstract class WorkstationMapRepository {
  /** La carte entière, archivés compris ; personne n'a rien réglé : une carte vide. */
  abstract load(): Promise<WorkstationMap>;

  /** Écrit ce que la carte a changé, et rien d'autre. */
  abstract save(map: WorkstationMap, stamp: WorkstationMapStamp): Promise<void>;
}
