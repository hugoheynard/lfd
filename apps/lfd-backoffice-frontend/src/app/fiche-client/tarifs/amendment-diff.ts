import type {
  CompanyMercurialeLinePayload,
  GeneralDiscountPayload,
  GeneralDiscountView,
  MercurialeAmendmentPreviewView,
  MercurialePromotionPolicyPayload,
} from '@lfd/contracts';

import { millicentsField } from '../../commercial/tarification/grille/price-field';
import { toLines, type DraftPrices } from './draft-prices';
import {
  discountFormOf,
  discountPayload,
  discountProblem,
  discountViewOf,
  sameDiscount,
  type GeneralDiscountForm,
} from './general-discount-form';
import {
  policyPayload,
  policyProblem,
  samePolicy,
  type PromotionPolicyForm,
} from './promotion-policy';

/**
 * **L'écart d'un avenant** (`documentation/pricing/mercuriales/l-avenant-date.md`,
 * § 1) : de l'état de la mercuriale à la date d'effet — rendu par l'aperçu —
 * et de ce qu'on a saisi dans la table, ce que l'avenant change, article par
 * article, pour la remise et pour les promotions. Pur.
 *
 * L'état de référence vient du serveur (`state`) : la composition des
 * segments datés reste chez lui, l'écran ne la refait pas.
 */

/** La mercuriale à la date d'effet, avant l'avenant. */
export type AmendmentState = MercurialeAmendmentPreviewView['state'];

/** Ce qu'on a saisi dans la table. */
export interface AmendmentEdit {
  /** Les prix fixes saisis ; un article absent n'a pas de prix ferme. */
  readonly firm: DraftPrices;
  /** Les lignes à paliers qu'on retire — elles ne se réécrivent pas. */
  readonly removedTiered: ReadonlySet<string>;
  readonly discount: GeneralDiscountForm | null;
  readonly policy: PromotionPolicyForm;
}

/** Ce que l'avenant fait au prix ferme d'un article. `before: null` = une ligne à paliers. */
export type FirmChange =
  | { readonly kind: 'changed'; readonly before: number; readonly after: number }
  | { readonly kind: 'added'; readonly after: number }
  | { readonly kind: 'removed'; readonly before: number | null };

export interface AmendmentDiff {
  /** Par article, dans l'ordre de l'état puis de la saisie. */
  readonly firm: ReadonlyMap<string, FirmChange>;
  readonly lines: readonly CompanyMercurialeLinePayload[];
  readonly endedSkus: readonly string[];
  /** `null` = la remise ne change pas. */
  readonly generalDiscount: { readonly set: GeneralDiscountPayload | null } | null;
  /** `null` = la politique ne change pas. */
  readonly promotionPolicy: MercurialePromotionPolicyPayload | null;
  /** Une saisie incomplète (remise, « Seulement celles choisies » vide) : elle ne part pas. */
  readonly problem: string | null;
}

/** Le prix fixe d'une ligne ferme, ou `null` si elle est à paliers (venue d'un gabarit). */
export function fixedPriceOf(tiers: AmendmentState['firm'][number]['tiers']): number | null {
  const [only, ...rest] = tiers;
  return only !== undefined && rest.length === 0 && only.minQuantity <= 1
    ? only.unitPriceMillicents
    : null;
}

/** Les articles dont le prix ferme est une grille à paliers. */
export function tieredSkusOf(state: AmendmentState): ReadonlySet<string> {
  return new Set(
    state.firm.filter((entry) => fixedPriceOf(entry.tiers) === null).map((entry) => entry.sku),
  );
}

/** La table pré-remplie avec ce qui est en vigueur à la date d'effet. */
export function editOf(state: AmendmentState): AmendmentEdit {
  const firm = new Map<string, string>();
  for (const entry of state.firm) {
    const price = fixedPriceOf(entry.tiers);
    if (price !== null) {
      firm.set(entry.sku, millicentsField(price));
    }
  }
  return {
    firm,
    removedTiered: new Set(),
    discount: discountFormOf(state.generalDiscount),
    policy: state.promotionPolicy,
  };
}

function firmChanges(state: AmendmentState, edit: AmendmentEdit): Map<string, FirmChange> {
  const typed = new Map(toLines(edit.firm).map((line) => [line.sku, line.unitPriceMillicents]));
  const changes = new Map<string, FirmChange>();
  const known = new Set<string>();
  for (const entry of state.firm) {
    known.add(entry.sku);
    const before = fixedPriceOf(entry.tiers);
    if (before === null) {
      if (edit.removedTiered.has(entry.sku)) {
        changes.set(entry.sku, { kind: 'removed', before: null });
      }
      continue;
    }
    const after = typed.get(entry.sku);
    if (after === undefined) {
      changes.set(entry.sku, { kind: 'removed', before });
    } else if (after !== before) {
      changes.set(entry.sku, { kind: 'changed', before, after });
    }
  }
  for (const [sku, after] of typed) {
    if (!known.has(sku)) {
      changes.set(sku, { kind: 'added', after });
    }
  }
  return changes;
}

/**
 * **L'écart**, ligne par ligne du tableau du § 1 : un prix changé arrête
 * l'ancien et ouvre le nouveau dans le même avenant ; un prix vidé l'arrête.
 * La remise se compare **par valeur** (`sameDiscount`) : rouvrir puis refermer
 * l'écran ne fabrique pas un avenant qui se croit plein.
 */
export function amendmentDiff(state: AmendmentState, edit: AmendmentEdit): AmendmentDiff {
  const firm = firmChanges(state, edit);
  const entries = [...firm.entries()];
  const discountIssue = discountProblem(edit.discount);
  const discountChanged =
    discountIssue === null && !sameDiscount(discountViewOf(edit.discount), state.generalDiscount);
  const policyIssue = policyProblem(edit.policy);
  const policyChanged = policyIssue === null && !samePolicy(edit.policy, state.promotionPolicy);
  return {
    firm,
    lines: entries.flatMap(([sku, change]) =>
      change.kind === 'removed' ? [] : [{ sku, unitPriceMillicents: change.after }],
    ),
    endedSkus: entries.flatMap(([sku, change]) => (change.kind === 'added' ? [] : [sku])),
    generalDiscount: discountChanged
      ? { set: edit.discount === null ? null : discountPayload(edit.discount) }
      : null,
    promotionPolicy: policyChanged ? policyPayload(edit.policy) : null,
    problem: discountIssue ?? policyIssue,
  };
}

/** Le nombre de changements que la barre compte : un par article, un pour la remise, un pour les promotions. */
export function changeCount(diff: AmendmentDiff): number {
  return (
    diff.firm.size +
    (diff.generalDiscount === null ? 0 : 1) +
    (diff.promotionPolicy === null ? 0 : 1)
  );
}

/** La remise qui vaudra après l'avenant : la saisie si elle change, sinon celle en vigueur. */
export function discountAfter(
  state: AmendmentState,
  diff: AmendmentDiff,
): GeneralDiscountView | null {
  return diff.generalDiscount === null ? state.generalDiscount : diff.generalDiscount.set;
}
