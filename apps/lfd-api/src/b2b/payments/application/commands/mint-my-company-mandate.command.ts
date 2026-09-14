/**
 * Le client **génère son mandat** depuis « Mon compte ».
 *
 * Pas d'autre charge utile que la société : tout ce que le papier porte est
 * déjà en base, et le rejouer rend le brouillon existant plutôt qu'un 409 — un
 * client qui recharge la page ne doit pas buter sur une erreur (plan
 * `documentation/b2b/plan-mandat-client.md` §2).
 */
export class MintMyCompanyMandateCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
