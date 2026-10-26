import { allRanks, shipmentLabel } from './shipment-choice';

describe('les envois à cocher (plan E7 reliquat, L4c)', () => {
  it('nomme la commande, puis le reste de la commande — jamais « reliquat »', () => {
    expect(shipmentLabel({ rank: 1, reference: 'CMD-1', totalUnits: 1, lines: [] })).toBe(
      'La commande — CMD-1, 1 pièce',
    );
    expect(shipmentLabel({ rank: 2, reference: 'CMD-1-2', totalUnits: 3, lines: [] })).toBe(
      'Le reste de la commande — CMD-1-2, 3 pièces',
    );
  });

  it('coche tout à l’ouverture', () => {
    expect(
      allRanks([
        { rank: 1, reference: 'CMD-1', totalUnits: 1, lines: [] },
        { rank: 2, reference: 'CMD-1-2', totalUnits: 1, lines: [] },
      ]),
    ).toEqual([1, 2]);
  });
});
