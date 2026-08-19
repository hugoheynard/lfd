/**
 * Lit **une** commande. Le mur dépend de son propriétaire, pas de la requête :
 * commande **personnelle** ⇒ le seul `placedByUserId` ; commande d'**entreprise**
 * ⇒ en être membre. Le handler résout l'un ou l'autre après l'avoir lue — on ne
 * peut pas savoir laquelle avant.
 */
export class GetOrderQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
