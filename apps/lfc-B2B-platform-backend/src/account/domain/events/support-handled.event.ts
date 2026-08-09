/**
 * Fait de domaine : une demande de contact a été **traitée** par le staff.
 * C'est ce qui la sort de la file — et ce qui rouvre au client la possibilité
 * d'en déposer une nouvelle.
 */
export class SupportHandledEvent {
  constructor(
    readonly supportRequestId: string,
    readonly companyId: string,
    /** Instant du traitement (temps métier, issu du `Clock`). */
    readonly handledAt: Date,
  ) {}
}
