/**
 * Lit le **bon de commande** d'une commande, pour son client.
 *
 * 🔴 **Aucune audience en paramètre, et c'est le cœur de la requête.** Elle est
 * décidée par la ROUTE, pas par l'appelant : un client qui pourrait demander
 * `audience=staff` recevrait les SKU, le tarif d'entrée et la trace du prix —
 * c'est-à-dire exactement ce que la projection existe pour retenir. Une
 * audience qui voyage dans une requête est une audience que le demandeur
 * choisit.
 *
 * Le mur est celui de `GetOrderQuery`, à l'identique : commande personnelle ⇒
 * son auteur, commande d'entreprise ⇒ en être membre.
 */
export class GetOrderSheetQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
