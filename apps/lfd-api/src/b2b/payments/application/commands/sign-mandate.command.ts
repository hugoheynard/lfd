/**
 * Déclarer qu'un brouillon **est revenu signé**.
 *
 * Vise le mandat **par son identifiant**, pas la société. C'est le geste où
 * l'ambiguïté coûte le plus cher : en rotation bancaire, un mandat actif est
 * toujours en vigueur pendant qu'on fait signer son remplaçant, et « le mandat
 * de cette société » ne désigne alors plus rien de précis.
 */
export class SignMandateCommand {
  constructor(
    readonly companyId: string,
    readonly mandateId: string,
    /** La date portée par le PAPIER, `YYYY-MM-DD`. */
    readonly signedAt: string,
    /** La révision de la pièce RELUE — la signature est refusée si elle a changé. */
    readonly proofRevision: string,
  ) {}
}
