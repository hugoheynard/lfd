import type { ActivationSupportPayload } from "@lfd/contracts";

/**
 * Port d'**écriture** des demandes de support à l'activation. Wallé par
 * `companyId` (vérifié en amont) ; enregistre la demande pour l'équipe commerciale.
 */
export abstract class SupportRequestRepository {
  /**
   * Y a-t-il une demande **ouverte** (non traitée, `handled_at` nul) pour cette
   * entreprise ? Sert à n'en autoriser qu'une à la fois.
   */
  abstract hasOpenRequest(companyId: string): Promise<boolean>;

  /** Enregistre une demande et renvoie son identifiant. */
  abstract record(
    companyId: string,
    requestedByUserId: string,
    request: ActivationSupportPayload,
  ): Promise<string>;
}
