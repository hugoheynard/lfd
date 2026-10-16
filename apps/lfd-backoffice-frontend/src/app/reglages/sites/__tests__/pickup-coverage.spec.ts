import type { SiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { pickupGaps } from '../pickup-coverage';

/**
 * **Les clientèles sans site de retrait** (Hugo, 2026-10-16) — la même règle
 * que le `where` du serveur : retrait coché, non archivé, ouvert à la clientèle.
 */
const SITE: SiteView = {
  id: 'pick_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  pickup: true,
  supply: 'on_site',
  deliveryDeparture: false,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  archivedAt: null,
  isDeparture: false,
};

const OPEN = { b2b: true, b2c: true };

describe('pickupGaps', () => {
  it('ne signale rien quand un site remet aux deux', () => {
    expect(pickupGaps([SITE], OPEN)).toEqual([]);
  });

  it('tient un site d’avant les cases pour ouvert aux deux', () => {
    expect(pickupGaps([{ ...SITE, pickupAudiences: undefined }], OPEN)).toEqual([]);
  });

  it('signale la clientèle à qui aucun site ne remet, particuliers d’abord', () => {
    expect(pickupGaps([], OPEN).map((gap) => gap.audience)).toEqual(['b2c', 'b2b']);
  });

  it('dit le retrait fermé en signalement quand la livraison reste ouverte', () => {
    expect(pickupGaps([{ ...SITE, pickupAudiences: { b2b: false, b2c: true } }], OPEN)).toEqual([
      {
        audience: 'b2b',
        variant: 'warning',
        message: 'Aucun site de retrait pour les pros : le retrait ne leur est pas proposé.',
      },
    ]);
  });

  it('passe en alerte quand la livraison est fermée à la même clientèle', () => {
    expect(
      pickupGaps([{ ...SITE, pickupAudiences: { b2b: true, b2c: false } }], {
        b2b: true,
        b2c: false,
      }),
    ).toEqual([
      {
        audience: 'b2c',
        variant: 'alert',
        message: 'Les particuliers ne peuvent plus commander : ni retrait, ni livraison.',
      },
    ]);
  });

  it('ne compte ni un site archivé, ni un site sans retrait', () => {
    const gaps = pickupGaps(
      [
        { ...SITE, archivedAt: '2026-10-13T08:00:00.000Z' },
        { ...SITE, id: 'pick_2', pickup: false },
      ],
      OPEN,
    );
    expect(gaps).toHaveLength(2);
  });

  it('ne crie pas sur un réglage de livraison non lu', () => {
    expect(pickupGaps([], null).every((gap) => gap.variant === 'warning')).toBe(true);
  });
});
