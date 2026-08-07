/**
 * Fait de domaine : **une société est passée cliente** (`pending → active`) par
 * l'activation commerciale. C'est **le jalon de conversion** du module croissance.
 */
export class CompanyActivatedEvent {
  constructor(
    readonly companyId: string,
    /** Instant d'activation (temps métier, issu du `Clock`). */
    readonly activatedAt: Date,
  ) {}
}
