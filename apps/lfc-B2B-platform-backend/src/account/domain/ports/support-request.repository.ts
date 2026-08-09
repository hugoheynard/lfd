import type { ActivationSupportPayload, SupportRequestView } from "@lfd/contracts";

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

  /**
   * La file staff : les demandes **ouvertes** seules, ou tout l'historique.
   * Triée du plus ancien au plus récent — on traite dans l'ordre d'arrivée.
   */
  abstract list(openOnly: boolean): Promise<readonly SupportRequestView[]>;

  /**
   * Marque une demande **traitée**. Rend la société concernée (pour journaliser),
   * ou `null` si la demande n'existe pas — c'est l'appelant qui décide du 404.
   *
   * Idempotent : re-traiter une demande déjà close ne rouvre rien et ne
   * réécrit pas la date, sinon deux clics feraient mentir le délai de traitement.
   */
  abstract markHandled(supportRequestId: string, handledAt: Date): Promise<string | null>;
}
