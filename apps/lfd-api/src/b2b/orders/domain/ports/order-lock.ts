/**
 * **Le verrou de la commande** (`SELECT … FOR UPDATE` sur `orders`), dans
 * l'unité de travail de l'appelant (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, lot L5b).
 *
 * La remise du rang 1 le prend avant de juger s'il reste un envoi à remettre :
 * la remise d'un reste prend le même (`lockProgressOf`), et sans lui les deux
 * se croiseraient sans que l'une voie l'autre — la commande resterait « en
 * partie retirée » pour toujours. Port à part (ISP) : la remise ne parcourt
 * ni ne relit rien.
 */
export abstract class OrderLock {
  abstract lock(orderId: string): Promise<void>;
}
