import type { GeneralDiscountView } from '@lfd/contracts';

import { impactLabel } from '../../commercial/tarification/grille/mercuriale-row';
import { discountLabel } from './general-discount-reading';

/**
 * **Le résumé d'une mercuriale posée**, en trois blocs lisibles d'un coup
 * d'œil : ses prix fermes, sa remise générale, ses promotions. Pur.
 */

/** Un bloc de résumé : une valeur forte, et une précision facultative. */
export interface SummaryFigure {
  readonly value: string;
  readonly detail: string | null;
}

/** « 1 article », « 12 articles », « Aucun ». */
export function articleCount(count: number): string {
  if (count === 0) {
    return 'Aucun';
  }
  return count === 1 ? '1 article' : `${String(count)} articles`;
}

/**
 * **Les prix fermes** : combien, et l'écart moyen au tarif catalogue quand il
 * se calcule (les lignes hors catalogue n'en ont pas).
 */
export function firmSummary(skuCount: number, gaps: readonly (number | null)[]): SummaryFigure {
  const known = gaps.filter((gap): gap is number => gap !== null);
  if (skuCount === 0 || known.length === 0) {
    return { value: articleCount(skuCount), detail: null };
  }
  const mean = Math.round(known.reduce((sum, gap) => sum + gap, 0) / known.length);
  return {
    value: articleCount(skuCount),
    detail: `Écart moyen au catalogue : ${impactLabel(mean)}`,
  };
}

/** Une ligne de la remise : sa cible, et son taux ou son exclusion. */
export interface DiscountSummaryLine {
  readonly key: string;
  readonly name: string;
  /** « −50 % » ou « exclue ». */
  readonly value: string;
  readonly excluded: boolean;
}

/** La remise générale résumée : un taux en tête, sa portée, puis ses lignes. */
export interface DiscountSummary {
  /** Le taux de base (« −10 % »), `null` en mode « seulement ». */
  readonly rate: string | null;
  readonly scope: string;
  /** Les taux particuliers d'abord, les exclusions ensuite. */
  readonly lines: readonly DiscountSummaryLine[];
}

/**
 * **La remise générale lue** : « −10 % sur le reste du catalogue », puis
 * « Baguettes & flûtes −50 % », « Chocolat — exclue ». Les lignes sont des
 * taux particuliers ou des exclusions, jamais une liste d'exceptions qu'une
 * phrase en « sauf » laissait croire.
 */
export function discountSummary(
  view: GeneralDiscountView | null,
  names: ReadonlyMap<string, string>,
): DiscountSummary | null {
  if (view === null) {
    return null;
  }
  const lines = view.rules
    .map((rule) => ({
      key: `${rule.target}:${rule.targetId}`,
      name: names.get(rule.targetId) ?? rule.targetId,
      value: rule.bp === null ? 'exclue' : discountLabel(rule.bp),
      excluded: rule.bp === null,
    }))
    .sort((a, b) => Number(a.excluded) - Number(b.excluded));
  if (view.mode === 'only' || view.baseBp === null) {
    return { rate: null, scope: 'Seulement sur :', lines };
  }
  const rated = lines.some((line) => !line.excluded);
  const excluded = lines.some((line) => line.excluded);
  return {
    rate: discountLabel(view.baseBp),
    scope: rated || excluded ? 'sur le reste du catalogue' : 'sur tout le catalogue',
    lines,
  };
}
