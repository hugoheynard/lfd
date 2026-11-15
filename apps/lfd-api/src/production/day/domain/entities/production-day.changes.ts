/**
 * **Ce qui a changé dans une journée depuis sa lecture** — ce que l'adaptateur
 * lit pour n'écrire que la différence (audit du réassort, 2026-11-02).
 *
 * Jusque-là, chaque `save` effaçait puis recréait commandes, comptes et
 * réassorts de la journée, sous `FOR UPDATE` : un lancement de réassort « au
 * plus tôt » réécrivait toutes les commandes du jour pour en ajouter un.
 * L'agrégat sait ce que chacun de ses gestes touche ; il le dit ici, et
 * l'adaptateur s'y tient.
 *
 * Une journée que l'adaptateur n'a pas relue lui-même (`fromSnapshot`) a une
 * base inconnue : elle s'écrit en entier (`whole`), comme avant.
 */
export interface ProductionDayChanges {
  /** Base inconnue : tout effacer et tout réécrire (commandes, réassorts, compte). */
  readonly whole: boolean;
  /** Le plan du soir est remplacé : commandes et réassorts du soir (arrêt, réouverture). */
  readonly plan: boolean;
  /** Les commandes entrées au plan (le retirage), par identifiant de commande. */
  readonly addedOrders: readonly string[];
  /** Les commandes dont la quantité due a été révisée, par identifiant de commande. */
  readonly revisedOrders: readonly string[];
  /** Les réassorts « au plus tôt » lancés, par identifiant de réassort. */
  readonly launched: readonly string[];
  /** Le compte à produire a été refait. */
  readonly counts: boolean;
}

/** Rien n'a changé : une journée relue en base, ou jamais écrite. */
export const UNCHANGED_DAY: ProductionDayChanges = {
  whole: false,
  plan: false,
  addedOrders: [],
  revisedOrders: [],
  launched: [],
  counts: false,
};

/** Base inconnue : tout est à réécrire. */
export const WHOLE_DAY: ProductionDayChanges = { ...UNCHANGED_DAY, whole: true };

/** Le plan du soir remplacé, et le compte avec lui. */
export function planReplaced(changes: ProductionDayChanges): ProductionDayChanges {
  return { ...changes, plan: true, counts: true };
}

/** Des commandes entrées au plan, et le compte refait. */
export function ordersAdded(
  changes: ProductionDayChanges,
  orderIds: readonly string[],
): ProductionDayChanges {
  return { ...changes, addedOrders: [...changes.addedOrders, ...orderIds], counts: true };
}

/** Une commande révisée, et le compte refait. */
export function orderRevised(changes: ProductionDayChanges, orderId: string): ProductionDayChanges {
  return { ...changes, revisedOrders: [...changes.revisedOrders, orderId], counts: true };
}

/** Un réassort lancé, et le compte refait. */
export function resupplyLaunched(
  changes: ProductionDayChanges,
  resupplyId: string,
): ProductionDayChanges {
  return { ...changes, launched: [...changes.launched, resupplyId], counts: true };
}
