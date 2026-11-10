import type { PreviousExportPart } from "../services/bank-export-reference.js";

/**
 * **La numérotation des exports des comptes** — le rang `EXC-<n>` et la série
 * en cours (doc `procedure-de-prelevement.md`, « Les identifiants courts et
 * les noms de fichiers »).
 *
 * 🔴 `nextRank` s'appelle DANS l'unité de travail de la préparation : le rang
 * pris verrouille le compteur jusqu'au COMMIT, et un rollback le rend.
 */
export abstract class AccountBankExportNumbering {
  /** Le rang suivant du compteur global des exports des comptes. */
  abstract nextRank(): Promise<number>;

  /** Le dernier export non abandonné de l'entité ; `null` s'il n'y en a aucun. */
  abstract lastPart(legalEntityId: string): Promise<PreviousExportPart | null>;
}

/** La même chose pour les exports des mandats — `EXM-<n>`. */
export abstract class MandateBankExportNumbering {
  abstract nextRank(): Promise<number>;

  abstract lastPart(legalEntityId: string): Promise<PreviousExportPart | null>;
}
