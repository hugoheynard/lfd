import type { OrderClientele } from "@lfd/contracts";

/**
 * Fait de domaine : **une commande vient d'être passée**. Publié par le contexte
 * `orders` après persistance ; le contexte ne sait pas qui l'écoute. Le journal
 * croissance en dérive un signal « lead chaud » (a commandé).
 *
 * Montants en **centimes** (jamais de float dans les signaux analytiques).
 */
export class OrderPlacedEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client connecté qui a passé la commande (mur d'une commande zéro-friction). */
    readonly placedByUserId: string,
    /** Société rattachée, ou `null` (commande zéro-friction personnelle). */
    readonly companyId: string | null,
    /** Le TTC. */
    readonly totalCents: number,
    /** Le HT (`orderPretaxCents`), que l'historique dit pour une commande pro. */
    readonly pretaxCents: number,
    readonly clientele: OrderClientele,
  ) {}
}
