import { describe, expect, it } from 'vitest';

import { previewBody } from '../amendment-body';
import { amendmentDiff, editOf } from '../amendment-diff';
import { defaultEffectDay } from '../amendment-effect';
import { STATE, TODAY } from './amendment-fixture';

/** **La date d'effet d'un avenant** : le jour proposé, et « maintenant » sans `validFrom`. */

describe('defaultEffectDay', () => {
  it('le plus tard entre aujourd’hui et le premier jour de la mercuriale (à Paris)', () => {
    expect(defaultEffectDay('2027-11-09T23:00:00.000Z', TODAY)).toBe('2027-11-10');
    expect(defaultEffectDay('2026-01-01T00:00:00.000Z', TODAY)).toBe(TODAY);
  });

  it('une date future part en `validFrom` ; aujourd’hui reste absent', () => {
    const diff = amendmentDiff(STATE, editOf(STATE));
    expect(previewBody(diff, '2027-11-10', TODAY)).toMatchObject({
      validFrom: '2027-11-09T23:00:00.000Z',
    });
    expect(previewBody(diff, TODAY, TODAY)).not.toHaveProperty('validFrom');
  });
});
