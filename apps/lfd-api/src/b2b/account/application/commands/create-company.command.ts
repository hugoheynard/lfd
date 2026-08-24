/**
 * Déclare une nouvelle entreprise, dont l'auteur devient le gestionnaire.
 *
 * Le contact principal n'est pas dans la commande : c'est le profil de
 * `ownerUserId`, relu par le handler (cf. `Company.declare`).
 */
export class CreateCompanyCommand {
  constructor(
    readonly ownerUserId: string,
    readonly raisonSociale: string,
    readonly enseigne: string,
    readonly formeJuridique: string,
    readonly siret: string,
    readonly vatNumber: string,
  ) {}
}
