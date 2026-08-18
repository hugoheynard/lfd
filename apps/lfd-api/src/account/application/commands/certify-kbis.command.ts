/**
 * Certifier — ou décertifier — le KBIS d'une société. Acte **staff** (Porte B),
 * sans mur membership : `AdminAuthGuard` porte l'autorisation en amont.
 *
 * `staffSub` n'est pas de la décoration : c'est ce qui transforme un booléen en
 * engagement. Un compte s'active parce que quelqu'un a regardé l'extrait ; on
 * garde qui, et à quel titre.
 */
export class CertifyKbisCommand {
  constructor(
    readonly companyId: string,
    readonly staffSub: string,
  ) {}
}

/**
 * Retire la certification. Un clic de trop doit pouvoir se défaire — sans quoi
 * la seule issue serait de redéposer le fichier pour repartir de zéro, et
 * personne n'oserait plus cliquer.
 */
export class RevokeKbisCertificationCommand {
  constructor(readonly companyId: string) {}
}
