import type { BankReturnCheckDay } from "../entities/bank-return-check.js";

/**
 * Port d'ÉCRITURE de l'attestation « Retours contrôlés » : il prend et rend
 * l'agrégat d'un jour. Le registre n'est fait que d'ajouts — `save` n'écrit
 * que les lignes nouvelles, jamais ne modifie ni n'efface.
 */
export abstract class BankReturnCheckRepository {
  /** Le jour de CETTE entité, vide s'il n'a encore aucune ligne. */
  abstract load(legalEntityId: string, day: string): Promise<BankReturnCheckDay>;
  /**
   * Le même jour, SOUS VERROU (entité, jour), dans l'unité de travail de
   * l'appelant : deux attestations simultanées se jouent l'une après
   * l'autre, et la seconde est refusée par l'agrégat au lieu d'inscrire une
   * seconde ligne. Hors d'une unité de travail, refus technique.
   */
  abstract loadLocked(legalEntityId: string, day: string): Promise<BankReturnCheckDay>;
  abstract save(checkDay: BankReturnCheckDay): Promise<void>;
}
