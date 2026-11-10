/**
 * Certifier le KBIS d'une société. Acte **staff** (Porte B), sans mur
 * membership : `AdminAuthGuard` porte l'autorisation en amont. Le geste inverse
 * est `RevokeKbisCertificationCommand`.
 *
 * `staffUserId` n'est pas de la décoration : c'est ce qui transforme un booléen en
 * engagement. Un compte s'active parce que quelqu'un a regardé l'extrait ; on
 * garde qui, et à quel titre.
 */
export class CertifyKbisCommand {
  constructor(
    readonly companyId: string,
    readonly staffUserId: string,
  ) {}
}
