import type { ActivationSupportPayload } from "@lfd/contracts";

/**
 * Port d'**écriture** des demandes de support à l'activation. Wallé par
 * `companyId` (vérifié en amont) ; enregistre la demande pour l'équipe commerciale.
 */
export abstract class SupportRequestRepository {
  /** Enregistre une demande et renvoie son identifiant. */
  abstract record(
    companyId: string,
    requestedByUserId: string,
    request: ActivationSupportPayload,
  ): Promise<string>;
}
