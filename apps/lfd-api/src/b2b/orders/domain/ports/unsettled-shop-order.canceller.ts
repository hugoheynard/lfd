/**
 * Port d'**écriture** de l'expiration des commandes boutique non réglées (plan
 * `documentation/order/commande-carte-reglee.md`, §4.2).
 *
 * 🔴 **Écriture nue, conditionnée en base, et c'est voulu** — même raison que
 * `OrderRepository.markAbandoned` (vérifié le 2026-10-09) : `Order` est un
 * agrégat de PASSATION qui ne sait pas se recharger, et la règle tient entière
 * dans le `where` (le périmètre boutique, `status: placed`, règlement non
 * encaissé). Une load→save y perdrait l'atomicité face au webhook
 * d'encaissement pour zéro invariant de plus.
 *
 * Étroit par construction (ISP) : l'expiration n'écrit rien d'autre, et ce
 * port n'est pas une méthode de plus sur `OrderRepository`.
 */
export abstract class UnsettledShopOrderCanceller {
  /**
   * `cancelled` + `failed`, si la commande est encore dans le périmètre.
   *
   * @returns `true` si la ligne a franchi — l'appelant publie lui-même le
   * fait ; `false` si elle a été payée, abandonnée ou balayée entre-temps.
   */
  abstract cancel(orderId: string): Promise<boolean>;
}
