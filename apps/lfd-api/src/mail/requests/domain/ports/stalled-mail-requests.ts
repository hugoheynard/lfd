import type { MailRequest } from "../entities/mail-request.js";

/** Ce que le balayeur cherche, calculé par l'application à partir du `Clock`. */
export interface StalledMailCriteria {
  /** Une tentative engagée avant cet instant est en retard (orpheline, ou échec à reprendre). */
  readonly attemptedBefore: Date;
  /** Un échec dont la première tentative précède cet instant n'est plus reprenable. */
  readonly firstAttemptSince: Date;
  /** Le plafond d'essais : un échec qui l'a atteint n'est plus reprenable. */
  readonly maxAttempts: number;
  /** Combien de demandes au plus par passage. */
  readonly limit: number;
}

/**
 * Port de **chargement** du balayeur (plan `plan-service-e-mails.md`, § 8) :
 * les envois différés en retard — `sending` dont la tentative est ancienne
 * (y compris au-delà de la fenêtre : le balayeur y renonce), `failed`
 * reprenables. Les plus anciens d'abord, par lots bornés.
 *
 * Distinct de `MailRequestRepository` (ISP) : seul le balayeur cherche par
 * retard ; il range ensuite par le dépôt, comme tout le monde.
 */
export abstract class StalledMailRequests {
  abstract due(criteria: StalledMailCriteria): Promise<readonly MailRequest[]>;
}
