import type {
  AmendCompanyMercurialePayload,
  CompanyPricingCategoryView,
  PosedMercurialeView,
} from '@lfd/contracts';

import { millicentsOf } from '../../../commercial/tarification/grille/price-field';
import { businessDayStart } from '../../../shared/business-day';

/** La borne du motif — celle du contrat (`amendCompanyMercurialePayloadSchema`). */
export const AMENDMENT_REASON_MAX_LENGTH = 500;

/**
 * **Ce qu'on saisit pour un avenant** (`plan-tarif-date-sur-une-reference.md`,
 * T6). Les jours en `AAAA-MM-JJ`, vides quand on n'en veut pas : un début vide
 * vaut « dès maintenant » (un avenant n'est jamais rétroactif, et minuit
 * d'aujourd'hui serait déjà passé), une fin vide « jusqu'à la fin de la
 * mercuriale ».
 */
export interface PriceAmendmentForm {
  readonly sku: string | null;
  readonly euros: number | null;
  readonly fromDay: string;
  readonly toDay: string;
  readonly reason: string;
}

export interface EndAmendmentForm {
  readonly sku: string | null;
  readonly fromDay: string;
  readonly reason: string;
}

export type AmendmentDraft =
  | { readonly ok: true; readonly payload: AmendCompanyMercurialePayload }
  | { readonly ok: false; readonly refusal: string };

/** Les articles dont la mercuriale fait le prix AUJOURD'HUI — grille et avenants. */
export function runningSkus(mercuriale: PosedMercurialeView): ReadonlySet<string> {
  return new Set(
    mercuriale.lines
      .filter((line) => (line.status ?? mercuriale.status) === 'active')
      .map((line) => line.sku),
  );
}

/**
 * **Ajouter ou changer un prix.** Si l'article a déjà un prix en cours, le
 * même avenant arrête l'ancien à la même date (Q1 de Hugo : changer un prix =
 * arrêter puis rouvrir) — le commercial n'a pas à composer les deux gestes.
 */
export function priceAmendment(
  form: PriceAmendmentForm,
  running: ReadonlySet<string>,
): AmendmentDraft {
  const reason = form.reason.trim();
  if (form.sku === null) {
    return { ok: false, refusal: 'Choisissez l’article.' };
  }
  const millicents = form.euros === null ? null : millicentsOf(form.euros.toFixed(5));
  if (millicents === null || millicents <= 0) {
    return { ok: false, refusal: 'Saisissez un prix HT positif.' };
  }
  if (reason === '') {
    return { ok: false, refusal: 'Le motif est obligatoire : il reste au journal de l’accord.' };
  }
  const window = windowOf(form.fromDay, form.toDay);
  if (!window.ok) {
    return window;
  }
  return {
    ok: true,
    payload: {
      ...window.bounds,
      reason,
      lines: [{ sku: form.sku, unitPriceMillicents: millicents }],
      endedSkus: running.has(form.sku) ? [form.sku] : [],
    },
  };
}

/** **Arrêter une ligne** à une date : le prix négocié cesse, le client repasse au tarif. */
export function endAmendment(form: EndAmendmentForm): AmendmentDraft {
  const reason = form.reason.trim();
  if (form.sku === null) {
    return { ok: false, refusal: 'Choisissez la ligne à arrêter.' };
  }
  if (reason === '') {
    return { ok: false, refusal: 'Le motif est obligatoire : il reste au journal de l’accord.' };
  }
  const window = windowOf(form.fromDay, '');
  if (!window.ok) {
    return window;
  }
  return {
    ok: true,
    payload: { ...window.bounds, reason, lines: [], endedSkus: [form.sku] },
  };
}

type WindowDraft =
  | {
      readonly ok: true;
      readonly bounds: { validFrom?: string; validTo: string | null };
    }
  | { readonly ok: false; readonly refusal: string };

function windowOf(fromDay: string, toDay: string): WindowDraft {
  const from = fromDay === '' ? null : businessDayStart(fromDay);
  const to = toDay === '' ? null : businessDayStart(toDay);
  if ((fromDay !== '' && from === null) || (toDay !== '' && to === null)) {
    return { ok: false, refusal: 'Une date n’est pas lisible.' };
  }
  return {
    ok: true,
    bounds: from === null ? { validTo: to } : { validFrom: from, validTo: to },
  };
}

/** Les articles du catalogue pro, pour choisir celui qu'on ajoute. */
export function catalogueOptions(
  categories: readonly CompanyPricingCategoryView[],
): readonly { readonly value: string; readonly label: string }[] {
  return categories.flatMap((category) =>
    category.items.map((item) => ({ value: item.sku, label: `${item.name} — ${item.sku}` })),
  );
}

/** Les lignes qu'on peut arrêter : celles qui font un prix aujourd'hui. */
export function runningOptions(
  mercuriale: PosedMercurialeView,
): readonly { readonly value: string; readonly label: string }[] {
  const running = runningSkus(mercuriale);
  const seen = new Set<string>();
  return mercuriale.lines.flatMap((line) => {
    if (!running.has(line.sku) || seen.has(line.sku)) {
      return [];
    }
    seen.add(line.sku);
    return [{ value: line.sku, label: `${line.productName} — ${line.sku}` }];
  });
}
