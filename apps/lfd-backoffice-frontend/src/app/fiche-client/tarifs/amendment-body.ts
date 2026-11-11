import type { AmendCompanyMercurialePayload } from '@lfd/contracts';

import { businessDayStart } from '../../shared/business-day';
import { changeCount, type AmendmentDiff } from './amendment-diff';
import { datingProblem, effectFrom, type AmendmentWindow } from './amendment-effect';

/**
 * **Le corps d'un avenant** (`documentation/pricing/mercuriales/l-avenant-date.md`) :
 * ce qui part à l'enregistrement, ou ce qui l'empêche de partir, et le corps
 * de l'aperçu. Pur.
 */

/** La borne du motif — celle du contrat (`amendCompanyMercurialePayloadSchema`). */
export const AMENDMENT_REASON_MAX_LENGTH = 500;

/** Ce qu'il faut pour dater l'avenant et l'enregistrer (étape 3). */
export interface AmendmentDating extends AmendmentWindow {
  readonly reason: string;
  readonly basedOnAmendmentId: string | null;
}

export type AmendmentDraft =
  | { readonly ok: true; readonly payload: AmendCompanyMercurialePayload }
  | { readonly ok: false; readonly refusal: string };

function changesOf(diff: AmendmentDiff): Omit<AmendCompanyMercurialePayload, 'reason' | 'validTo'> {
  return {
    lines: [...diff.lines],
    endedSkus: [...diff.endedSkus],
    ...(diff.promotionPolicy === null ? {} : { promotionPolicy: diff.promotionPolicy }),
    ...(diff.generalDiscount === null ? {} : { generalDiscount: diff.generalDiscount }),
  };
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
