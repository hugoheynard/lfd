import type { MailDeliveryReport } from "../value-objects/mail-delivery.js";

/** Un retour rangé qu'une demande connue ne porte pas encore. */
export interface UnappliedMailDelivery {
  readonly providerId: string;
  readonly report: MailDeliveryReport;
}

/**
 * Port de **lecture** du balayeur (`le-suivi-des-e-mails.md`,
 * décision 2) : les retours rangés plus graves que celui de la demande qui
 * porte leur identifiant — ceux qu'une application a manqués (le webhook est
 * arrivé entre la lecture et l'écriture de l'envoi, ou son application a
 * échoué). Les retours sans demande n'y sont pas : ils attendent, puis la
 * purge des orphelins les retire.
 */
export abstract class UnappliedMailDeliveries {
  /**
   * Au plus `limit` retours reçus depuis `receivedSince`, les plus
   * anciennement reçus d'abord ; un seul par identifiant, le plus grave.
   */
  abstract due(receivedSince: Date, limit: number): Promise<readonly UnappliedMailDelivery[]>;
}
