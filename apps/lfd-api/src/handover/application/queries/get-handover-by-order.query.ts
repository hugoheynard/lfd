/**
 * **Ce qu'il y a dans ce sac**, par l'identifiant de la commande.
 *
 * 🔴 Une requête distincte de {@link GetHandoverQuery} bien qu'elles rendent la
 * même vue, et c'est la clé qui les sépare : celle-là part d'un **secret** que
 * le client présente, celle-ci d'un **identifiant** que la file vient de rendre
 * dans la même session. Les fondre ferait accepter un identifiant là où le
 * secret est la protection — c'est-à-dire ouvrirait le scan à qui a vu passer
 * une liste.
 */
export class GetHandoverByOrderQuery {
  constructor(readonly orderId: string) {}
}
