import type { ShipmentRef } from "../../../production/channels/handover/index.js";

/**
 * **« Lesquels sont déjà remis ? »** — lu dans `order_handover` par
 * l'abonné du départ (`plan-depart-durable.md`, §5, B3).
 *
 * Un port de LECTURE à part d'`OrderHandoverRepository` (ISP) : l'abonné ne
 * grave rien, il trie. Un envoi remis avant que le départ ne soit livré
 * (aucun ordre n'est supposé entre les faits) ne « repart » pas.
 *
 * Par envoi `(commande, rang)` depuis L4b (plan E7 reliquat) : un rang 1
 * remis ne fait pas passer pour remis le reliquat qui part ensuite.
 */
export abstract class HandedOverOrdersReader {
  /** Les envois de `shipments` qui portent déjà une attestation de retrait. */
  abstract handedOverAmong(shipments: readonly ShipmentRef[]): Promise<readonly ShipmentRef[]>;
}
