/**
 * La seule chose que le carnet demande d'une société : existe-t-elle ?
 *
 * Port **étroit** (ISP) : le carnet n'a besoin ni de l'identité, ni du statut,
 * ni des adresses. Une note se pose sur un client quel que soit son statut — un
 * prospect en attente se prépare, un compte résilié se relit —, donc seule
 * l'absence refuse.
 */
export abstract class NotebookCompanies {
  /** Vrai si une société existe sous cet identifiant. */
  abstract exists(companyId: string): Promise<boolean>;
}
