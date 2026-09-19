import type { PersonRef } from "./journal-names.js";

/** Canal de déclaration d'une société : par le client lui-même, ou par le staff. */
export type CompanyDeclarationChannel = "self" | "staff";

/**
 * Fait de domaine : **une société vient d'être déclarée** (dossier créé, statut
 * `pending`). Le canal est le signal clé du module croissance : `self` sans
 * interaction staff = **adoption+** (product-led) ; `staff` = déclarée en démarchage.
 *
 * Il porte les noms du moment (lot B du plan des phrases, 2026-09-19) : celui
 * de la société, et celui de son détenteur — l'abonné qui l'inscrit au journal
 * n'a pas à les relire.
 */
export class CompanyDeclaredEvent {
  constructor(
    readonly companyId: string,
    /** Le nom qu'affichent les écrans — l'enseigne, à défaut la raison sociale. */
    readonly companyName: string,
    readonly via: CompanyDeclarationChannel,
    /** Créateur (self-signup) ou `null` (déclarée par le staff, sans propriétaire). */
    readonly owner: PersonRef | null,
  ) {}
}
