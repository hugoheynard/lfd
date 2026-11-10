import type { BankReturnCheckDay } from "../entities/bank-return-check.js";

/**
 * Port d'ÉCRITURE de l'attestation « Retours contrôlés » : il prend et rend
 * l'agrégat d'un jour. Le registre n'est fait que d'ajouts — `save` n'écrit
 * que les lignes nouvelles, jamais ne modifie ni n'efface.
 */
export abstract class BankReturnCheckRepository {
  /** Le jour de CETTE entité, vide s'il n'a encore aucune ligne. */
  abstract load(legalEntityId: string, day: string): Promise<BankReturnCheckDay>;
  abstract save(checkDay: BankReturnCheckDay): Promise<void>;
}
