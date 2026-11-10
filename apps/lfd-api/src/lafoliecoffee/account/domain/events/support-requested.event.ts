/**
 * Fait de domaine : un client **demande à être contacté** par l'équipe
 * commerciale (chemin non daté — rappel au plus vite ou e-mail).
 */
export class SupportRequestedEvent {
  constructor(
    readonly supportRequestId: string,
    /** Société concernée, ou `null` — la demande porte alors sur la personne. */
    readonly companyId: string | null,
    readonly requestedByUserId: string,
    /**
     * Le nom du sujet au moment du fait (lot B du plan des phrases) : celui de
     * la société, sinon celui de la personne — `null` si elle n'en porte pas.
     */
    readonly subjectLabel: string | null,
    readonly channel: string,
    /** Instant de la demande (temps métier, issu du `Clock`). */
    readonly requestedAt: Date,
  ) {}
}
