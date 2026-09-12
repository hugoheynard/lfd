/**
 * Le mandat SEPA d'un client, **prérempli des deux côtés**, pour relecture.
 *
 * 🔴 C'est une PRÉVISUALISATION, pas une pièce à signer — et la différence n'est
 * pas dans l'intention, elle est dans le document : le rendu porte toujours la
 * mention « EXEMPLE » en travers de la page. Tant que la RUM n'est pas frappée,
 * une signature apposée dessus créerait un mandat sans référence, inutilisable,
 * mais que le client croirait avoir donné.
 */
export class PreviewCustomerMandateQuery {
  constructor(readonly companyId: string) {}
}
