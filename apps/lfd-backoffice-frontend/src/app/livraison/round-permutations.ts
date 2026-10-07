/**
 * Les permutations d'arrêts que l'organisateur demande au serveur : monter,
 * descendre, glisser d'une liste à l'autre. Sorties de `delivery-rounds.ts`
 * parce qu'elles ne lisent aucun contrat — elles ne manipulent que des listes
 * d'identifiants, et le serveur exige toujours la permutation ENTIÈRE (I2).
 */
/**
 * La permutation complète après avoir déplacé l'arrêt `index` de `delta`
 * (−1 monte, +1 descend) — `null` s'il est déjà au bord. Le serveur exige la
 * liste ENTIÈRE (I2), jamais un échange de deux lignes.
 */
export function shiftedOrder(
  stopIds: readonly string[],
  index: number,
  delta: -1 | 1,
): readonly string[] | null {
  const target = index + delta;
  const moving = stopIds[index];
  const other = stopIds[target];
  if (moving === undefined || other === undefined) {
    return null;
  }
  const next = [...stopIds];
  next[index] = other;
  next[target] = moving;
  return next;
}

/** Une place dans une liste nommée : la tournée (ou « à répartir »), et le rang. */
export interface ListSlot {
  readonly list: string;
  readonly index: number;
}

/** Des listes d'identifiants, par nom : les tournées et « à répartir ». */
export type OrderLists = Readonly<Record<string, readonly string[]>>;

/**
 * Les listes après avoir glissé l'élément de `from` vers `to` — `null` si le
 * geste ne change rien ou vise hors des listes. Ne rend QUE les listes
 * touchées, ENTIÈRES : le serveur exige la permutation complète (I2).
 *
 * `to.index` suit le glisser-déposer : dans la même liste, le rang final de
 * l'élément ; vers une autre liste, le rang où il s'insère (borné à la fin).
 */
export function movedOrder(lists: OrderLists, from: ListSlot, to: ListSlot): OrderLists | null {
  const source = lists[from.list];
  const target = lists[to.list];
  const moving = source?.[from.index];
  if (source === undefined || target === undefined || moving === undefined) {
    return null;
  }
  const remaining = source.filter((_, index) => index !== from.index);
  if (from.list === to.list) {
    const at = Math.max(0, Math.min(to.index, remaining.length));
    if (at === from.index) {
      return null;
    }
    return { [from.list]: [...remaining.slice(0, at), moving, ...remaining.slice(at)] };
  }
  const at = Math.max(0, Math.min(to.index, target.length));
  return {
    [from.list]: remaining,
    [to.list]: [...target.slice(0, at), moving, ...target.slice(at)],
  };
}
