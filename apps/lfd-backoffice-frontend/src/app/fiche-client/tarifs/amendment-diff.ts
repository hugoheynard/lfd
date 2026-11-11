import type {
  AmendCompanyMercurialePayload,
  CompanyMercurialeLinePayload,
  GeneralDiscountPayload,
  GeneralDiscountView,
  MercurialeAmendmentPreviewView,
  MercurialePromotionPolicyPayload,
} from '@lfd/contracts';

import { millicentsField } from '../../commercial/tarification/grille/price-field';
import { businessDayStart } from '../../shared/business-day';
import { parisToday } from '../../shared/paris-today';
import { toLines, type DraftPrices } from './draft-prices';
import {
  articleDiscount,
  discountBpFor,
  discountFormOf,
  discountLabel,
  discountPayload,
  discountProblem,
  discountViewOf,
  sameDiscount,
  type DiscountArticle,
  type GeneralDiscountForm,
} from './general-discount';
import {
  policyPayload,
  policyProblem,
  samePolicy,
  type PromotionPolicyForm,
} from './promotion-policy';

/**
 * **L'écart d'un avenant** (`documentation/pricing/mercuriales/l-avenant-date.md`,
 * § 1) : de l'état de la mercuriale à la date d'effet — rendu par l'aperçu —
 * et de ce qu'on a saisi dans la table, le corps de l'avenant, l'étiquette de
 * chaque ligne et le prix d'après quand l'écran sait le faire. Pur.
 *
 * L'état de référence vient du serveur (`state`) : la composition des
 * segments datés reste chez lui, l'écran ne la refait pas.
 */

/** La mercuriale à la date d'effet, avant l'avenant. */
export type AmendmentState = MercurialeAmendmentPreviewView['state'];

/** La borne du motif — celle du contrat (`amendCompanyMercurialePayloadSchema`). */
export const AMENDMENT_REASON_MAX_LENGTH = 500;

/** La phrase de F1 : ce qui ne revient pas de soi-même à la fin d'un avenant. */
export const NO_END_REASON =
  'Un prix changé ou retiré, et les promotions, ne reviennent pas d’eux-mêmes à une date : faites un second avenant à cette date.';

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

/**
 * **F1** : une fin n'est proposée que si l'avenant n'arrête aucun prix et ne
 * touche pas aux promotions — ni l'un ni l'autre ne revient à sa fin.
 */
export function endAllowed(diff: AmendmentDiff): boolean {
  return diff.endedSkus.length === 0 && diff.promotionPolicy === null;
}

/** La remise qui vaudra après l'avenant : la saisie si elle change, sinon celle en vigueur. */
export function discountAfter(
  state: AmendmentState,
  diff: AmendmentDiff,
): GeneralDiscountView | null {
  return diff.generalDiscount === null ? state.generalDiscount : diff.generalDiscount.set;
}

/** Ce qu'il faut pour dater l'avenant et l'enregistrer (étape 3). */
export interface AmendmentDating {
  /** `AAAA-MM-JJ` ; vide ou aujourd'hui = maintenant. */
  readonly fromDay: string;
  /** `AAAA-MM-JJ` ; vide = jusqu'à la fin de la mercuriale. */
  readonly toDay: string;
  readonly reason: string;
  /** Aujourd'hui à Paris, `AAAA-MM-JJ`. */
  readonly today: string;
  readonly basedOnAmendmentId: string | null;
}

export type AmendmentDraft =
  | { readonly ok: true; readonly payload: AmendCompanyMercurialePayload }
  | { readonly ok: false; readonly refusal: string };

/**
 * `validFrom` : **absent** pour « maintenant » — aujourd'hui compris, dont le
 * minuit est déjà passé et serait refusé comme rétroactif.
 */
export function effectFrom(fromDay: string, today: string): { validFrom?: string } {
  const from = fromDay === '' || fromDay === today ? null : businessDayStart(fromDay);
  return from === null ? {} : { validFrom: from };
}

function changesOf(diff: AmendmentDiff): Omit<AmendCompanyMercurialePayload, 'reason' | 'validTo'> {
  return {
    lines: [...diff.lines],
    endedSkus: [...diff.endedSkus],
    ...(diff.promotionPolicy === null ? {} : { promotionPolicy: diff.promotionPolicy }),
    ...(diff.generalDiscount === null ? {} : { generalDiscount: diff.generalDiscount }),
  };
}

/** Le refus de la date, ou `null`. */
function datingProblem(diff: AmendmentDiff, dating: AmendmentDating): string | null {
  const from = dating.fromDay === '' ? dating.today : dating.fromDay;
  if (from < dating.today) {
    return 'La date d’effet ne peut pas être passée : un avenant n’est jamais rétroactif.';
  }
  if (dating.toDay !== '' && !endAllowed(diff)) {
    return NO_END_REASON;
  }
  if (dating.toDay !== '' && dating.toDay <= from) {
    return 'La fin doit venir après la date d’effet.';
  }
  return null;
}

/** **Le corps de l'avenant**, ou ce qui l'empêche de partir. */
export function amendmentBody(diff: AmendmentDiff, dating: AmendmentDating): AmendmentDraft {
  if (diff.problem !== null) {
    return { ok: false, refusal: diff.problem };
  }
  if (changeCount(diff) === 0) {
    return { ok: false, refusal: 'L’avenant ne change rien.' };
  }
  const datingIssue = datingProblem(diff, dating);
  if (datingIssue !== null) {
    return { ok: false, refusal: datingIssue };
  }
  const reason = dating.reason.trim();
  if (reason === '') {
    return { ok: false, refusal: 'Le motif est obligatoire : il reste au journal de l’accord.' };
  }
  if (reason.length > AMENDMENT_REASON_MAX_LENGTH) {
    return {
      ok: false,
      refusal: `Le motif tient en ${String(AMENDMENT_REASON_MAX_LENGTH)} caractères au plus.`,
    };
  }
  const to = dating.toDay === '' ? null : businessDayStart(dating.toDay);
  return {
    ok: true,
    payload: {
      ...effectFrom(dating.fromDay, dating.today),
      validTo: to,
      reason,
      ...changesOf(diff),
      basedOnAmendmentId: dating.basedOnAmendmentId,
    },
  };
}

/** Le motif que l'aperçu exige du contrat ; il n'est jamais écrit. */
const PREVIEW_REASON = 'Aperçu';

/**
 * **Le corps de l'aperçu** : les changements, à la date d'effet, sans fin —
 * l'aperçu résout chaque prix à `validFrom`, où la fin ne change rien.
 */
export function previewBody(
  diff: AmendmentDiff,
  fromDay: string,
  today: string,
): AmendCompanyMercurialePayload {
  return {
    ...effectFrom(fromDay, today),
    validTo: null,
    reason: PREVIEW_REASON,
    ...changesOf(diff),
  };
}

/** L'étiquette d'une ligne de la table ; `changed: false` = un repère, pas un changement. */
export interface RowLabel {
  readonly label: string;
  readonly changed: boolean;
}

/**
 * **L'étiquette d'une ligne** : « prix changé », « prix ajouté », « prix
 * retiré », « suit la remise » (un prix retiré que la remise couvre — Q1),
 * « passe à −35 % », « sort de la remise », ou le repère « à paliers ».
 * `null` = rien à dire.
 */
export function rowLabel(
  article: Pick<DiscountArticle, 'sku' | 'categoryPath'>,
  state: AmendmentState,
  edit: AmendmentEdit,
  diff: AmendmentDiff,
): RowLabel | null {
  const after = discountAfter(state, diff);
  const bpAfter = after === null ? null : discountBpFor(after, article);
  const change = diff.firm.get(article.sku);
  if (change !== undefined) {
    if (change.kind === 'changed') {
      return { label: 'prix changé', changed: true };
    }
    if (change.kind === 'added') {
      return { label: 'prix ajouté', changed: true };
    }
    return { label: bpAfter === null ? 'prix retiré' : 'suit la remise', changed: true };
  }
  if (tieredSkusOf(state).has(article.sku)) {
    return { label: 'à paliers', changed: false };
  }
  if (edit.firm.has(article.sku)) {
    return null;
  }
  const before = state.generalDiscount;
  const bpBefore = before === null ? null : discountBpFor(before, article);
  if (bpBefore === bpAfter) {
    return null;
  }
  return bpAfter === null
    ? { label: 'sort de la remise', changed: true }
    : { label: `passe à ${discountLabel(bpAfter)}`, changed: true };
}

/** Le prix d'après calculé à l'écran, avec la limite. */
export interface LocalAfter {
  readonly millicents: number;
  readonly floored: boolean;
}

/**
 * **« Après l'avenant » à l'étape 1**, pour les seuls prix que la mercuriale
 * fait : le prix ferme saisi, ou la remise sur le prix de base, relevés par la
 * limite — l'arithmétique de la caisse (`@lfd/money`, via `articleDiscount`).
 * `null` = l'article sort de la mercuriale : seule la caisse sait son prix
 * (recalculé à la vérification).
 */
export function localAfter(
  article: DiscountArticle,
  edit: AmendmentEdit,
  after: GeneralDiscountView | null,
): LocalAfter | null {
  const typed = toLines(edit.firm).find((line) => line.sku === article.sku);
  if (typed !== undefined) {
    const floor = article.floorMillicents;
    const floored = floor !== null && typed.unitPriceMillicents < floor;
    return { millicents: floored ? floor : typed.unitPriceMillicents, floored };
  }
  const cut = after === null ? null : articleDiscount(after, article);
  return cut === null ? null : { millicents: cut.finalMillicents, floored: cut.floored };
}

/**
 * **La date d'effet par défaut** : le plus tard entre aujourd'hui et le
 * premier jour de la mercuriale. Une mercuriale qui n'a pas commencé ne
 * s'amende pas avant son début — « maintenant » y serait refusé.
 */
export function defaultEffectDay(mercurialeValidFrom: string, today: string): string {
  const start = parisToday(new Date(mercurialeValidFrom));
  return start > today ? start : today;
}
