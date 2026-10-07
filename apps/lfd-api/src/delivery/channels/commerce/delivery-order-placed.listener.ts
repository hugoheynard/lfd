/**
 * **« Une commande vient d'être passée »** (`documentation/livraisons/tournees/composition-automatique.md`,
 * Q4, lot CA0) — ce que la livraison DÉCLARE et IMPLÉMENTE elle-même
 * (`delivery/application/delivery-stops-locating.ts`), et que le commerce
 * APPELLE depuis son abonné à `order.placed`. Relié dans
 * `appBootstrap/delivery-stops-locating.module.ts`.
 *
 * Le seul port du canal dans ce sens-là : la livraison ne peut pas écouter
 * un fait du commerce (`delivery → b2b` est interdit), et `order.placed`
 * n'est pas un fait durable. Le commerce ne sait pas ce qu'on en fait — la
 * livraison situe l'adresse.
 *
 * 🔴 Contrat : l'appel ne fait JAMAIS échouer ni attendre la passation. Il
 * rend la main tout de suite ; le travail (réseau compris) part après la
 * validation, en fond, et son échec est journalisé, jamais remonté.
 */
export abstract class DeliveryOrderPlacedListener {
  abstract orderPlaced(orderId: string): void;
}
