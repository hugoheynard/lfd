import type { ActivationSupportPayload, SupportRequestView } from "@lfd/contracts";

/** Sur qui porte une demande : une société, ou à défaut la personne. */
export interface SupportRequestScope {
  readonly companyId: string | null;
  readonly requestedByUserId: string;
}

/** Ce que la clôture rend : de quoi journaliser, ou `null` si la demande n'existe pas. */
export interface HandledSupportRequest {
  readonly companyId: string | null;
  readonly requestedByUserId: string;
}

/**
 * Port d'**écriture** des demandes de support à l'activation. Wallé par
 * `companyId` **quand il y en a un** (vérifié en amont) ; enregistre la demande
 * pour l'équipe commerciale.
 */
export abstract class SupportRequestRepository {
  /**
   * Y a-t-il une demande **ouverte** (non traitée, `handled_at` nul) sur cette
   * portée ? Sert à n'en autoriser qu'une à la fois — par société quand il y en
   * a une, **par personne** sinon : sans ça, un prospect sans entreprise pourrait
   * déposer autant de rappels qu'il a de clics.
   */
  abstract hasOpenRequest(scope: SupportRequestScope): Promise<boolean>;

  /** Enregistre une demande (sa société est dans le payload) et rend son identifiant. */
  abstract record(requestedByUserId: string, request: ActivationSupportPayload): Promise<string>;

  /**
   * La file staff : les demandes **ouvertes** seules, ou tout l'historique.
   * Triée du plus ancien au plus récent — on traite dans l'ordre d'arrivée.
   */
  abstract list(openOnly: boolean): Promise<readonly SupportRequestView[]>;

  /**
   * Marque une demande **traitée**. Rend de quoi la journaliser — sa société
   * (possiblement nulle) et son demandeur —, ou `null` si la demande n'existe
   * pas ; c'est l'appelant qui décide du 404. Un objet, et non la seule société :
   * celle-ci pouvant valoir `null`, elle ne peut plus signifier « introuvable ».
   *
   * Idempotent : re-traiter une demande déjà close ne rouvre rien et ne
   * réécrit pas la date, sinon deux clics feraient mentir le délai de traitement.
   */
  abstract markHandled(
    supportRequestId: string,
    handledAt: Date,
  ): Promise<HandledSupportRequest | null>;
}
