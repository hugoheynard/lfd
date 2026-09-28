import { describe, expect, it } from 'vitest';

import { serviceDayParam, shiftServiceDay } from './supervision-day';

describe('shiftServiceDay', () => {
  it('passe au lendemain et à la veille', () => {
    expect(shiftServiceDay('2026-09-28', 1)).toBe('2026-09-29');
    expect(shiftServiceDay('2026-09-28', -1)).toBe('2026-09-27');
  });

  it('franchit les fins de mois et d’année', () => {
    expect(shiftServiceDay('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftServiceDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftServiceDay('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('ne saute ni ne répète un jour au changement d’heure', () => {
    expect(shiftServiceDay('2026-10-24', 1)).toBe('2026-10-25');
    expect(shiftServiceDay('2026-10-25', 1)).toBe('2026-10-26');
    expect(shiftServiceDay('2026-03-29', -1)).toBe('2026-03-28');
  });
});

describe('serviceDayParam', () => {
  it('garde une date bien formée', () => {
    expect(serviceDayParam('2026-09-29')).toBe('2026-09-29');
  });

  it.each([null, '', 'demain', '2026-9-29', '2026-09-29T00:00'])('écarte %s', (raw) => {
    expect(serviceDayParam(raw)).toBeNull();
  });
});
