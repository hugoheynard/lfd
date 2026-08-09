/**
 * Fait de domaine : une demande de contact a été **traitée** par le staff.
 * C'est ce qui la sort de la file — et ce qui rouvre au client la possibilité
 * d'en déposer une nouvelle.
 */
export class SupportHandledEvent {
  constructor(
    readonly supportRequestId: string,
    /** Société concernée, ou `null` — la demande portait alors sur la personne. */
    readonly companyId: string | null,
    readonly requestedByUserId: string,
    /** Instant du traitement (temps métier, issu du `Clock`). */
    readonly handledAt: Date,
  ) {}
}
