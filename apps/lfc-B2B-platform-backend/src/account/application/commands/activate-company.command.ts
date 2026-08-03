/**
 * Commande **staff** : activer un compte client (`pending → active`). Sans mur
 * membership (Porte B), gatée serveur sur les pièces requises. Cf.
 * `documentation/architecture-activation-configuration-b2b.md`.
 */
export class ActivateCompanyByStaffCommand {
  constructor(readonly companyId: string) {}
}
