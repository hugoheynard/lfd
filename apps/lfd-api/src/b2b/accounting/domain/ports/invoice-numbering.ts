import type { InvoiceNumber } from "../value-objects/invoice-number.js";

/**
 * **La numérotation des factures** — une séquence par entité et par année,
 * sans trou (plan `plan-emission-de-la-facture.md`, § 5, lot E2).
 *
 * 🔴 Appelé DANS l'unité de travail de l'émission, et seulement là : le rang
 * pris verrouille le compteur jusqu'à la fin de la transaction, et un
 * rollback le rend avec elle. Pris hors transaction, il serait perdu au
 * premier échec qui suit — un trou dans une séquence qu'on doit justifier.
 * Les avoirs prennent leur numéro dans la MÊME séquence.
 */
export abstract class InvoiceNumbering {
  /**
   * Le rang suivant de l'entité pour l'année de `issuedOn` (`AAAA-MM-JJ`),
   * composé en numéro. La séquence est chronologique : un jour antérieur au
   * dernier émis est refusé, sans rang consommé.
   *
   * @throws {InvoiceIssuedBeforePreviousError} `issuedOn` précède la dernière émission.
   * @throws {InvalidInvoiceNumberError} la séquence de l'année est épuisée.
   */
  abstract next(legalEntityId: string, issuedOn: string): Promise<InvoiceNumber>;
}
