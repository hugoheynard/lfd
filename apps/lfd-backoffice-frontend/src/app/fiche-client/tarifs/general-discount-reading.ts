import type { GeneralDiscountView } from '@lfd/contracts';

import { BP_PER_PERCENT } from './general-discount-form';

/**
 * **La remise générale dite en mots** : un taux (« −32,5 % »), la remise lue
 * en tête et entrées, et la même en une phrase. Pur.
 */

/** `3000` → « −30 % », `3250` → « −32,5 % ». */
export function discountLabel(bp: number): string {
  const percent = (bp / BP_PER_PERCENT).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return `−${percent} %`;
}

/**
 * La remise lue : sa tête, puis une entrée par ligne (« Pains −40 % »,
 * « Chocolat exclue »). Les lignes sont des taux particuliers ou des
 * exclusions : la tête dit « sur le reste du catalogue », jamais « sauf »,
 * qui les faisait toutes lire comme des exclusions.
 */
export interface DiscountReading {
  readonly head: string;
  readonly items: readonly string[];
}

export function discountReading(
  view: GeneralDiscountView,
  names: ReadonlyMap<string, string>,
): DiscountReading {
  const items = view.rules.map(
    (rule) =>
      `${names.get(rule.targetId) ?? rule.targetId} ${rule.bp === null ? 'exclue' : discountLabel(rule.bp)}`,
  );
  const head =
    view.mode === 'only' || view.baseBp === null
      ? 'Seulement'
      : `${discountLabel(view.baseBp)} sur ${items.length > 0 ? 'le reste du' : 'tout le'} catalogue`;
  return { head, items };
}

/**
 * **La remise en une phrase** — « −30 % sur le reste du catalogue ; Pains
 * −40 % ; Chocolat exclue » ou « Seulement : Pains −40 % ».
 */
export function discountPhrase(
  view: GeneralDiscountView,
  names: ReadonlyMap<string, string>,
): string {
  const { head, items } = discountReading(view, names);
  if (items.length === 0) {
    return head;
  }
  return head === 'Seulement' ? `${head} : ${items.join(' ; ')}` : `${head} ; ${items.join(' ; ')}`;
}
