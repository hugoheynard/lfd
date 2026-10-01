import type { DeliveryStopOrderState } from "@lfd/contracts";

/** Où en est une commande, vue de la porte. */
export interface DeliveryOrderState {
  readonly orderId: string;
  readonly state: DeliveryStopOrderState;
}

/**
 * **Où en est la commande d'un arrêt** (`documentation/livraisons/plan-a-la-porte.md`,
 * AP-D2, L6-C11) — ce que la livraison DÉCLARE et que le commerce implémente
 * (`b2b/orders/infrastructure/`), relié dans `appBootstrap/delivery-feed.module.ts`.
 *
 * Un port À PART de `DeliveryOrdersReader` (ISP) : la porte n'a besoin que de
 * savoir si la commande reste à remettre, et la composition n'en a pas besoin.
 *
 * `handed_over` gagne sur tout : une commande retirée est retirée, même si son
 * statut commercial a bougé depuis — la règle de la file du comptoir.
 *
 * ⚠️ « Retenue au contrôle qualité » n'y est PAS : c'est un fait du fournil
 * (`production/channels/handover/`), que le commerce ne lit pas, et que la
 * livraison ne peut pas lire (`delivery → production` est fermé). Remonté au
 * lot A du plan « À la porte » (2026-10-01).
 */
export abstract class DeliveryOrderStatesReader {
  /** Ces commandes ; les inconnues sont absentes. */
  abstract statesOf(orderIds: readonly string[]): Promise<readonly DeliveryOrderState[]>;
}
