/**
 * Retire la certification du KBIS d'une société. Acte **staff** (Porte B),
 * sans mur membership : `AdminAuthGuard` porte l'autorisation en amont.
 *
 * Un clic de trop doit pouvoir se défaire — sans quoi la seule issue serait de
 * redéposer le fichier pour repartir de zéro, et personne n'oserait plus
 * cliquer.
 */
export class RevokeKbisCertificationCommand {
  constructor(readonly companyId: string) {}
}
