/**
 * **« Lesquelles sont déjà remises ? »** — lu dans `order_handover` par
 * l'abonné du départ (`plan-depart-durable.md`, §5, B3).
 *
 * Un port de LECTURE à part d'`OrderHandoverRepository` (ISP) : l'abonné ne
 * grave rien, il trie. Une commande remise avant que le départ ne soit livré
 * (aucun ordre n'est supposé entre les faits) ne « repart » pas.
 */
export abstract class HandedOverOrdersReader {
  /** Le sous-ensemble de `orderIds` qui porte déjà une attestation de retrait. */
  abstract handedOverAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>>;
}
