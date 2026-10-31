import type { PosedMercurialeAmendmentView, PromotionView } from '@lfd/contracts';

import { policyPhrase } from '../promotion-policy';

const DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' });

/**
 * Une ligne de la liste des avenants : quand, ce qu'il ouvre et ce qu'il
 * arrête, le motif et l'auteur. « Du 01/11/2026 à la fin de la mercuriale —
 * ouvre VIE-002-1 · arrête VIE-001-1 — « Prix revu » — Marie Curie ».
 */
export function amendmentLine(
  amendment: PosedMercurialeAmendmentView,
  promotions: readonly PromotionView[] | null = null,
): string {
  const from = DAY.format(new Date(amendment.validFrom));
  const window =
    amendment.validTo === null
      ? `Du ${from} à la fin de la mercuriale`
      : `Du ${from} au ${DAY.format(new Date(amendment.validTo))}`;
  const gestures: string[] = [];
  if (amendment.openedSkus.length > 0) {
    gestures.push(`ouvre ${amendment.openedSkus.join(', ')}`);
  }
  if (amendment.endedSkus.length > 0) {
    gestures.push(`arrête ${amendment.endedSkus.join(', ')}`);
  }
  if (amendment.promotionPolicy !== undefined && amendment.promotionPolicy !== null) {
    gestures.push(`promotions : ${policyPhrase(amendment.promotionPolicy, promotions)}`);
  }
  const author = amendment.createdByName ?? amendment.createdBy;
  return `${window} — ${gestures.join(' · ')} — « ${amendment.reason} » — ${author}`;
}
