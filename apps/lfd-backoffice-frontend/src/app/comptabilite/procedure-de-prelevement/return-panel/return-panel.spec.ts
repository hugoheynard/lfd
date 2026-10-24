import { describe, expect, it } from 'vitest';

import { feeCentsOf, returnKindOptions } from './return-panel';

describe('« Signaler un retour »', () => {
  it('un lot B2B ne propose pas le remboursement ; un lot CORE, si', () => {
    expect(returnKindOptions('B2B').map((option) => option.value)).toEqual(['reject', 'return']);
    expect(returnKindOptions('CORE').map((option) => option.value)).toContain('refund_request');
  });

  it('les frais : vides = aucun, « 7,50 » = 750 centimes, illisibles = refus', () => {
    expect(feeCentsOf('  ')).toBeNull();
    expect(feeCentsOf('7,50')).toBe(750);
    expect(feeCentsOf('7,505')).toBeUndefined();
  });
});
