/** Canal de déclaration d'une société : par le client lui-même, ou par le staff. */
export type CompanyDeclarationChannel = "self" | "staff";

/**
 * Fait de domaine : **une société vient d'être déclarée** (dossier créé, statut
 * `pending`). Le canal est le signal clé du module croissance : `self` sans
 * interaction staff = **adoption+** (product-led) ; `staff` = déclarée en démarchage.
 */
export class CompanyDeclaredEvent {
  constructor(
    readonly companyId: string,
    readonly via: CompanyDeclarationChannel,
    /** Créateur (self-signup) ou `null` (déclarée par le staff, sans propriétaire). */
    readonly ownerUserId: string | null,
  ) {}
}
