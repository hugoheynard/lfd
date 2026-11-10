import type { BankReturnCheckLine } from "../services/bank-return-checks.js";

/**
 * Port de LECTURE des attestations « Retours contrôlés » d'une entité — ce
 * que la procédure lit pour l'onglet 4. Distinct du port d'écriture (ISP) :
 * la lecture n'a pas besoin de l'agrégat. Une ligne par jour ouvré au plus
 * (plus ses retraits) : quelques centaines par an, lues d'un coup.
 */
export abstract class BankReturnChecksReader {
  /** Toutes les lignes de l'entité, retraits compris. */
  abstract ofEntity(legalEntityId: string): Promise<readonly BankReturnCheckLine[]>;
}
