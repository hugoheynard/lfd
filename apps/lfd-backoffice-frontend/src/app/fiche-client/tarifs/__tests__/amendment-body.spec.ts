import { describe, expect, it } from 'vitest';

import { amendmentBody, previewBody } from '../amendment-body';
import { amendmentDiff } from '../amendment-diff';
import { withEuros } from '../draft-prices';
import { DATING, edited, STATE, TODAY } from './amendment-fixture';

/** **Le corps d'un avenant** (`l-avenant-date.md`, § 8.1) : la date, la fin, le motif, l'aperçu. */

describe('amendmentBody', () => {
  const diff = amendmentDiff(
    STATE,
    edited((edit) => ({ ...edit, firm: withEuros(edit.firm, 'BRI', 1.8) })),
  );

  it('« maintenant » : `validFrom` absent, aujourd’hui compris ; le dernier avenant vu part', () => {
    const body = amendmentBody(diff, { ...DATING, fromDay: TODAY });
    expect(body.ok).toBe(true);
    expect(body.ok && 'validFrom' in body.payload).toBe(false);
    expect(body.ok && body.payload.basedOnAmendmentId).toBe('am_1');
  });

  it('une date future part à minuit à Paris, avec une fin quand F1 la permet', () => {
    const body = amendmentBody(diff, { ...DATING, fromDay: '2026-12-01', toDay: '2027-01-01' });
    expect(body).toMatchObject({
      ok: true,
      payload: { validFrom: '2026-11-30T23:00:00.000Z', validTo: '2026-12-31T23:00:00.000Z' },
    });
  });

  it('refuse une date passée, une fin avant le début et un motif vide', () => {
    expect(amendmentBody(diff, { ...DATING, fromDay: '2026-11-10' }).ok).toBe(false);
    expect(amendmentBody(diff, { ...DATING, fromDay: '2026-12-01', toDay: '2026-12-01' }).ok).toBe(
      false,
    );
    expect(amendmentBody(diff, { ...DATING, reason: '  ' }).ok).toBe(false);
  });

  it('le corps de l’aperçu ne porte ni fin ni motif réel', () => {
    expect(previewBody(diff, '', TODAY)).toMatchObject({ validTo: null, lines: [{ sku: 'BRI' }] });
  });
});
