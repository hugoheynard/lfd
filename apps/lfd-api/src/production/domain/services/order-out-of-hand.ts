/**
 * Où est passée une commande qui n'est plus au fournil : partie en livraison,
 * ou déjà retirée. Absente : toujours là.
 *
 * Un fait de la journée, que le canal du retrait publie
 * (`channels/handover/order-custody.reader.ts`) : il vit au noyau, et la
 * qualité le lit de là pour refuser un verdict (`refuse-order-out-of-hand.ts`).
 */
export type OrderOutOfHand = "departed" | "handed_over";
