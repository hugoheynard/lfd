import type { PosedMercurialeAmendmentView, PromotionView } from '@lfd/contracts';

import { discountPhrase } from '../general-discount';
import { POLICY_SUMMARY_LABEL, policyPhrase } from '../promotion-policy';

const DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' });

/** Un avenant tel que la liste le montre : quand, ce qu'il change, pourquoi et qui. */
export interface AmendmentEntry {
  readonly key: string;
  /** « Depuis le 01/11/2026 » ou « Du 01/11/2026 au 01/12/2026 ». */
  readonly period: string;
  /** Une puce courte par changement. */
  readonly changes: readonly string[];
  /** « « Prix revu » — Marie Curie ». */
  readonly byline: string;
}

function skuNames(skus: readonly string[], names: ReadonlyMap<string, string>): string {
  return skus.map((sku) => names.get(sku) ?? sku).join(', ');
}

/**
 * **Un avenant, lisible** : sa période en tête, ce qu'il change en puces
 * (« Prix ferme ouvert : Croissant (VIE-001-1) », « Remise générale arrêtée »,
 * « Promotions en plus des prix négociés : oui, toutes »), puis motif et
 * auteur. Les mots sont ceux du récapitulatif de l'avenant
 * (`amendment-recap.ts`).
 */
export function amendmentEntry(
  amendment: PosedMercurialeAmendmentView,
  promotions: readonly PromotionView[] | null = null,
  names: ReadonlyMap<string, string> = new Map(),
): AmendmentEntry {
  const from = DAY.format(new Date(amendment.validFrom));
  const period =
    amendment.validTo === null
      ? `Depuis le ${from}`
      : `Du ${from} au ${DAY.format(new Date(amendment.validTo))}`;
  const changes: string[] = [];
  if (amendment.openedSkus.length > 0) {
    changes.push(`Prix ferme ouvert : ${skuNames(amendment.openedSkus, names)}`);
  }
  if (amendment.endedSkus.length > 0) {
    changes.push(`Prix ferme arrêté : ${skuNames(amendment.endedSkus, names)}`);
  }
  const discount = amendment.generalDiscount;
  if (discount !== undefined && discount !== null) {
    changes.push(
      discount.set === null
        ? 'Remise générale arrêtée'
        : `Remise générale : ${discountPhrase(discount.set, names)}`,
    );
  }
  if (amendment.promotionPolicy !== undefined && amendment.promotionPolicy !== null) {
    changes.push(
      `${POLICY_SUMMARY_LABEL} : ${policyPhrase(amendment.promotionPolicy, promotions)}`,
    );
  }
  const author = amendment.createdByName ?? amendment.createdBy;
  return { key: amendment.id, period, changes, byline: `« ${amendment.reason} » — ${author}` };
}
