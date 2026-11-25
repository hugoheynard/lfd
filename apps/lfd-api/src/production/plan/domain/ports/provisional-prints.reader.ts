import type { ServiceDay } from "../../../day/index.js";

/** Une impression de la journée, telle que la fenêtre la liste. */
export interface ProvisionalPrintSummary {
  readonly id: string;
  readonly run: number;
  readonly printedAt: Date;
  /** L'id de la fiche staff. */
  readonly printedBy: string;
  readonly commerceVersion: number;
  /** Les fiches de fonction qu'elle a imprimées. */
  readonly functionSheetIds: readonly string[];
}

/**
 * **Lire les impressions provisoires d'une journée** — port de lecture,
 * distinct de l'écriture (ISP) : la fenêtre liste, le tirage « depuis #N »
 * relit les empreintes d'un numéro, la requête du PDF retrouve un tirage.
 */
export abstract class ProvisionalPrintsReader {
  /** Les impressions du jour, par numéro croissant. */
  abstract ofDay(day: ServiceDay): Promise<readonly ProvisionalPrintSummary[]>;

  /** Une impression de ce jour par son identifiant, `null` si aucune. */
  abstract find(day: ServiceDay, id: string): Promise<ProvisionalPrintSummary | null>;

  /** Les empreintes gardées au tirage `run` de ce jour, `null` s'il n'existe pas. */
  abstract fingerprintsOf(
    day: ServiceDay,
    run: number,
  ): Promise<ReadonlyMap<string, string> | null>;
}
