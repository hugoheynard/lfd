/**
 * Fait de domaine : un client **demande à être contacté** par l'équipe
 * commerciale (chemin non daté — rappel au plus vite ou e-mail).
 */
export class SupportRequestedEvent {
  constructor(
    readonly supportRequestId: string,
    readonly companyId: string,
    readonly channel: string,
    /** Instant de la demande (temps métier, issu du `Clock`). */
    readonly requestedAt: Date,
  ) {}
}
