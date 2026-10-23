import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/**
 * Les bornes dans le temps de la constitution d'un lot : d'où l'on part (le
 * plancher, la clôture précédente), ce qui attend sa facture, et quels
 * schémas sont déjà pris pour cette clôture.
 *
 * Sorti de `CollectionCandidatesReader` le 2026-10-23 (ISP) : ces lectures
 * situent le cycle, elles ne disent rien des commandes. Même adaptateur
 * (`useExisting`), aucune requête recopiée.
 */
export abstract class CollectionCalendarReader {
  /** Le plancher posé par la migration, `null` s'il a disparu. */
  abstract floor(): Promise<Date | null>;

  /** La dernière clôture d'un lot vivant de l'entité, strictement avant `before`. */
  abstract previousClosure(legalEntityId: string, before: Date): Promise<Date | null>;

  /**
   * La mise en service de la facture du mois (E4) : un bon passé depuis
   * attend sa facture au lieu d'être arrêté. `null` si la ligne a disparu.
   */
  abstract invoicingFloor(): Promise<Date | null>;

  /** Les schémas qui ont DÉJÀ un lot vivant pour cette clôture. */
  abstract liveSchemes(legalEntityId: string, closesAt: Date): Promise<readonly SepaScheme[]>;
}
