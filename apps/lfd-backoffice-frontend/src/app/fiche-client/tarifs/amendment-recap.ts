import type {
  GeneralDiscountView,
  MercurialeAmendmentPreviewView,
  PromotionView,
} from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';

import {
  discountAfter,
  rowLabel,
  type AmendmentDiff,
  type AmendmentEdit,
  type AmendmentState,
} from './amendment-diff';
import {
  DISCOUNT_MODE_LABELS,
  discountBpFor,
  discountLabel,
  type DiscountArticle,
} from './general-discount';
import { policyPhrase } from './promotion-policy';

/**
 * **Le récapitulatif d'un avenant, en phrases** (étape 2 de
 * `l-avenant-date.md`) : une phrase par changement, et en tête ce
 * qui peut surprendre — un refus de l'aperçu qui désigne la ligne, la limite
 * qui relève, un prix retiré qui passe à la remise (Q1) ou revient au
 * catalogue. Pur.
 */
export interface AmendmentRecap {
  readonly warnings: readonly string[];
  readonly entries: readonly string[];
  /** Ce qui change dans la remise, une puce par différence ; vide si elle ne change pas. */
  readonly discount: readonly string[];
}

export interface RecapContext {
  /** Les articles du catalogue de ce client, dans son ordre. */
  readonly articles: readonly DiscountArticle[];
  /** Les noms des cibles de la remise (familles et articles). */
  readonly names: ReadonlyMap<string, string>;
  readonly promotions: readonly PromotionView[] | null;
  /** L'aperçu calculé sur CE corps, ou `null` s'il n'est pas à jour. */
  readonly preview: MercurialeAmendmentPreviewView | null;
  /** Les articles qui coûteront plus cher — de l'aperçu à jour, sinon du calcul écran. */
  readonly dearer: readonly DearerArticle[];
}

function list(names: readonly string[]): string {
  return names.join(', ');
}

function firmEntries(diff: AmendmentDiff, state: AmendmentState, context: RecapContext): string[] {
  const after = discountAfter(state, diff);
  const afterOf = new Map((context.preview?.items ?? []).map((item) => [item.sku, item]));
  return context.articles.flatMap((article) => {
    const change = diff.firm.get(article.sku);
    if (change === undefined) {
      return [];
    }
    if (change.kind === 'changed') {
      return [
        `${article.name} : prix ferme ${formatEuros(change.before)} → ${formatEuros(change.after)}.`,
      ];
    }
    if (change.kind === 'added') {
      return [`${article.name} : prix ferme de ${formatEuros(change.after)} ajouté.`];
    }
    const bp = after === null ? null : discountBpFor(after, article);
    const what =
      change.before === null
        ? 'grille à paliers retirée'
        : `prix ferme de ${formatEuros(change.before)} retiré`;
    const where =
      bp === null
        ? 'revient au tarif hors mercuriale'
        : `passe à la remise générale ${discountLabel(bp)}`;
    const price = afterOf.get(article.sku);
    return [
      `${article.name} : ${what} — ${where}${price === undefined ? '' : ` : ${formatEuros(price.afterMillicents)}`}.`,
    ];
  });
}

/** Une remise réduite à ce qui se compare : le mode, le taux de base, et le taux par cible. */
interface DiscountShape {
  readonly mode: GeneralDiscountView['mode'] | null;
  readonly baseBp: number | null;
  readonly rules: ReadonlyMap<string, { readonly targetId: string; readonly bp: number | null }>;
}

function shapeOf(view: GeneralDiscountView | null): DiscountShape {
  return {
    mode: view?.mode ?? null,
    baseBp: view === null || view.mode === 'only' ? null : view.baseBp,
    rules: new Map(
      (view?.rules ?? []).map((rule) => [`${rule.target}:${rule.targetId}`, rule] as const),
    ),
  };
}

function rateWord(bp: number | null): string {
  return bp === null ? 'exclue' : discountLabel(bp);
}

function ruleChange(
  name: string,
  before: { readonly bp: number | null } | undefined,
  after: { readonly bp: number | null } | undefined,
  mode: DiscountShape['mode'],
): string | null {
  if (before === undefined && after !== undefined) {
    return `${name} : ligne ajoutée${after.bp === null ? ', exclue' : ` à ${discountLabel(after.bp)}`}`;
  }
  if (before !== undefined && after === undefined) {
    return `${name} : ligne retirée (${mode === 'all_except' ? 'suit le taux de base' : 'n’est plus remisée'})`;
  }
  if (before === undefined || after === undefined || before.bp === after.bp) {
    return null;
  }
  if (after.bp === null) {
    return `${name} : maintenant exclue`;
  }
  return before.bp === null
    ? `${name} : maintenant à ${discountLabel(after.bp)}`
    : `${name} : ${rateWord(before.bp)} → ${rateWord(after.bp)}`;
}

/**
 * **Ce qui change dans la remise**, une puce par différence — jamais les deux
 * remises entières côte à côte, qui obligeaient à chercher l'écart :
 * « Taux de base : −5 % → −10 % », « Pains : −40 % → −45 % », « Chocolat :
 * maintenant exclue », « Pains spéciaux : ligne ajoutée à −25 % ».
 */
export function discountChanges(
  before: GeneralDiscountView | null,
  after: GeneralDiscountView | null,
  names: ReadonlyMap<string, string>,
): readonly string[] {
  if (after === null) {
    return before === null ? [] : ['Remise générale arrêtée'];
  }
  const was = shapeOf(before);
  const next = shapeOf(after);
  const result: string[] = [];
  if (before === null) {
    result.push('Remise générale posée');
  } else if (was.mode !== next.mode) {
    result.push(
      `Mode : ${DISCOUNT_MODE_LABELS[was.mode ?? 'all_except']} → ${DISCOUNT_MODE_LABELS[after.mode]}`,
    );
  }
  if (was.baseBp !== next.baseBp) {
    const from = was.baseBp === null ? 'aucun' : discountLabel(was.baseBp);
    const to = next.baseBp === null ? 'aucun' : discountLabel(next.baseBp);
    result.push(`Taux de base : ${from} → ${to}`);
  }
  for (const key of new Set([...was.rules.keys(), ...next.rules.keys()])) {
    const rule = was.rules.get(key) ?? next.rules.get(key);
    const name = rule === undefined ? key : (names.get(rule.targetId) ?? rule.targetId);
    const line = ruleChange(name, was.rules.get(key), next.rules.get(key), after.mode);
    if (line !== null) {
      result.push(line);
    }
  }
  return result;
}

function discountEntries(
  diff: AmendmentDiff,
  state: AmendmentState,
  edit: AmendmentEdit,
  context: RecapContext,
): readonly string[] {
  if (diff.generalDiscount === null) {
    return [];
  }
  const moved = context.articles.filter(
    (article) =>
      !diff.firm.has(article.sku) && rowLabel(article, state, edit, diff)?.changed === true,
  ).length;
  const changes = discountChanges(state.generalDiscount, diff.generalDiscount.set, context.names);
  return moved > 0
    ? [...changes, `Change le prix de ${String(moved)} article(s) sans prix ferme`]
    : changes;
}

/** Un article qui coûtera plus cher qu'aujourd'hui. */
export interface DearerArticle {
  readonly name: string;
  readonly beforeMillicents: number;
  readonly afterMillicents: number;
}

/** Combien de noms l'avertissement cite avant « et N autres ». */
const DEARER_NAMED = 5;

/**
 * **« N article(s) seront plus chers qu'aujourd'hui »** — une hausse se dit
 * avant d'enregistrer (une remise qui remplace une promotion plus forte, par
 * exemple). `null` sans hausse.
 */
export function dearerWarning(dearer: readonly DearerArticle[]): string | null {
  if (dearer.length === 0) {
    return null;
  }
  const named = dearer
    .slice(0, DEARER_NAMED)
    .map(
      (article) =>
        `${article.name} (+${formatEuros(article.afterMillicents - article.beforeMillicents)})`,
    );
  const rest = dearer.length - named.length;
  const tail = rest > 0 ? ` et ${String(rest)} autre(s)` : '';
  return `${String(dearer.length)} article(s) seront plus chers qu’aujourd’hui : ${named.join(', ')}${tail}.`;
}

function policyEntry(diff: AmendmentDiff, state: AmendmentState, context: RecapContext): string[] {
  return diff.promotionPolicy === null
    ? []
    : [
        `Promotions sur les prix négociés : ${policyPhrase(diff.promotionPolicy, context.promotions)} (au lieu de : ${policyPhrase(state.promotionPolicy, context.promotions)}).`,
      ];
}

function warnings(
  diff: AmendmentDiff,
  state: AmendmentState,
  edit: AmendmentEdit,
  context: RecapContext,
): string[] {
  const nameOf = new Map(context.articles.map((article) => [article.sku, article.name]));
  const result: string[] = [];
  const refusal = context.preview?.refusals[0];
  if (refusal !== undefined) {
    const line = refusal.sku === null ? '' : ` Ligne : ${nameOf.get(refusal.sku) ?? refusal.sku}.`;
    result.push(`${refusal.message}${line}`);
  }
  const dearer = dearerWarning(context.dearer);
  if (dearer !== null) {
    result.push(dearer);
  }
  const floored = (context.preview?.items ?? [])
    .filter(
      (item) =>
        item.floored &&
        context.articles.some(
          (article) =>
            article.sku === item.sku && rowLabel(article, state, edit, diff)?.changed === true,
        ),
    )
    .map((item) => nameOf.get(item.sku) ?? item.sku);
  if (floored.length > 0) {
    result.push(
      `La limite relève ${String(floored.length)} article(s) au-dessus du prix voulu : ${list(floored)}.`,
    );
  }
  const after = discountAfter(state, diff);
  const removed = context.articles.filter(
    (article) => diff.firm.get(article.sku)?.kind === 'removed',
  );
  const toDiscount = removed.filter(
    (article) => after !== null && discountBpFor(after, article) !== null,
  );
  const toChain = removed.filter((article) => !toDiscount.includes(article));
  if (toDiscount.length > 0) {
    result.push(
      `${String(toDiscount.length)} prix retiré(s) passent à la remise générale, pas au catalogue : ${list(toDiscount.map((article) => article.name))}.`,
    );
  }
  if (toChain.length > 0) {
    result.push(
      `${String(toChain.length)} article(s) sortent de la mercuriale et reviennent au tarif catalogue, promotions comprises : ${list(toChain.map((article) => article.name))}.`,
    );
  }
  return result;
}

/** **Le récapitulatif** : les avertissements, puis une phrase par changement. */
export function amendmentRecap(
  diff: AmendmentDiff,
  state: AmendmentState,
  edit: AmendmentEdit,
  context: RecapContext,
): AmendmentRecap {
  return {
    warnings: warnings(diff, state, edit, context),
    entries: [...firmEntries(diff, state, context), ...policyEntry(diff, state, context)],
    discount: discountEntries(diff, state, edit, context),
  };
}
