import type { PackingSheet, SitePaletteEntryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { packingFrames } from './packing-frames';
import type { PackingEntry } from './packing-rounds';

const NO_COLORS = {
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  resupplyColor: null,
} as const;

const PALETTE: readonly SitePaletteEntryView[] = [
  {
    id: 'fournil',
    label: 'Fournil',
    supply: 'on_site',
    isDeparture: true,
    ...NO_COLORS,
    deliveryColorB2b: '#0d47a1',
  },
  {
    id: 'vv',
    label: 'Val Village',
    supply: 'transfer',
    isDeparture: false,
    ...NO_COLORS,
    pickupColorB2c: '#fdd835',
  },
];

function entry(
  reference: string,
  overrides: Partial<
    Pick<PackingSheet, 'fulfillmentMethod' | 'clientele' | 'siteId' | 'dueAt' | 'readyBy'>
  >,
): PackingEntry {
  const sheet = {
    orderId: `o_${reference}`,
    reference,
    fulfillmentMethod: 'delivery',
    clientele: 'pro',
    siteId: null,
    dueAt: null,
    ...overrides,
  } as const;
  // Seuls les champs que les cadres lisent : le reste de la fiche n'entre pas en jeu.
  return { sheet: { ...SHEET, ...sheet }, stop: null };
}

const SHEET: PackingSheet = {
  orderId: '',
  reference: '',
  containers: 0,
  customerLabel: 'Client',
  fulfillmentMethod: 'delivery',
  clientele: null,
  siteId: null,
  dueAt: null,
  destination: '',
  lines: [],
  lineCount: 0,
  packedLines: 0,
  remainingLines: 0,
  pieces: 0,
  packedPieces: 0,
  canReportShortfall: false,
  shortfallReportedAt: null,
  deliveryNoteReprintNeeded: false,
  canDeclareReady: false,
  coldOutsideIsotherm: [],
  packedAt: null,
  packedBy: null,
  packedByName: null,
  qualityHeld: false,
  containerMode: 'listed',
  containerList: [],
};

const ADROIT: SitePaletteEntryView = {
  id: 'adroit',
  label: 'Adroit',
  supply: 'on_site',
  isDeparture: false,
  ...NO_COLORS,
  pickupColorB2c: '#2e7d32',
};

/** La liste lue de haut en bas : une référence, ou [encadré, ses références]. */
function shape(items: ReturnType<typeof packingFrames>): unknown[] {
  return items.map((item) =>
    item.kind === 'transfer'
      ? [item.title, item.orders.map((order) => order.entry.sheet.reference)]
      : item.entry.sheet.reference,
  );
}

const pickup = (siteId: string, more: Parameters<typeof entry>[1] = {}) =>
  ({ fulfillmentMethod: 'pickup', clientele: 'public', siteId, ...more }) as const;

describe('packingFrames — une liste par urgence, la couleur en barre (Hugo, 2026-10-25)', () => {
  it('ne regroupe plus par type : la plus urgente en haut, toutes catégories mêlées', () => {
    const items = packingFrames(
      [
        entry('L1', { clientele: 'pro', readyBy: '07:10' }),
        entry('R', { ...pickup('adroit'), readyBy: '06:45' }),
        entry('L0', { clientele: 'pro', readyBy: null }),
        entry('P', { clientele: 'public', readyBy: '06:50' }),
        entry('L2', { clientele: 'pro', readyBy: '05:50' }),
      ],
      [...PALETTE, ADROIT],
    );

    // Sans heure (L0) en dernier.
    expect(shape(items)).toEqual(['L2', 'R', 'P', 'L1', 'L0']);
  });

  it('chaque commande porte la couleur de sa catégorie, et sa catégorie nommée', () => {
    const items = packingFrames(
      [
        entry('A', { readyBy: '06:00' }),
        entry('B', { ...pickup('adroit'), readyBy: '07:00' }),
        entry('C', { clientele: 'public', readyBy: '08:00' }),
      ],
      [...PALETTE, ADROIT],
    );

    expect(items.map((item) => item.kind === 'order' && [item.category, item.color])).toEqual([
      ['Livraison pro', '#0d47a1'],
      ['Retrait particulier Adroit', '#2e7d32'],
      ['Livraison particulier', null],
    ]);
  });

  it('à heure égale, l’ordre servi tient (tri stable)', () => {
    const items = packingFrames(
      [entry('B', { dueAt: '07:00' }), entry('A', { dueAt: '07:00' }), entry('C', {})],
      PALETTE,
    );

    expect(shape(items)).toEqual(['B', 'A', 'C']);
  });

  it('🔴 le transfert garde son encadré, rangé à l’heure de sa commande la plus urgente', () => {
    const items = packingFrames(
      [
        entry('L', { clientele: 'pro', readyBy: '07:00' }),
        entry('T2', { ...pickup('vv', { clientele: 'pro' }), readyBy: '09:00' }),
        entry('T1', { ...pickup('vv'), readyBy: '06:30' }),
        entry('M', { readyBy: '08:00' }),
      ],
      PALETTE,
    );

    expect(shape(items)).toEqual([['Transfert Val Village', ['T1', 'T2']], 'L', 'M']);
    const transfer = items[0];
    expect(transfer?.kind === 'transfer' && transfer.orders[0]?.color).toBe('#fdd835');
  });

  it('à heure égale, l’encadré du transfert passe devant', () => {
    const items = packingFrames([entry('L', {}), entry('T', pickup('vv'))], PALETTE);

    expect(shape(items)).toEqual([['Transfert Val Village', ['T']], 'L']);
  });

  it('l’heure servie l’emporte sur l’échéance figée', () => {
    const items = packingFrames(
      [
        entry('A', { dueAt: '06:00', readyBy: '08:00' }),
        entry('B', { dueAt: '11:00', readyBy: '07:00' }),
      ],
      PALETTE,
    );

    expect(shape(items)).toEqual(['B', 'A']);
  });

  it('le réapprovisionnement entre dans l’encadré du transfert, et jamais un encadré vide', () => {
    const withItems = packingFrames([], PALETTE, [
      { siteId: 'vv', items: [{ key: 'r1', label: 'Pain de mie × 12' }] },
    ]);
    const empty = packingFrames([], PALETTE, [{ siteId: 'vv', items: [] }]);

    expect(withItems).toEqual([
      expect.objectContaining({
        title: 'Transfert Val Village',
        replenishment: [{ key: 'r1', label: 'Pain de mie × 12' }],
      }),
    ]);
    expect(empty).toEqual([]);
  });

  it('🔴 sans site : la teinte neutre, jamais une couleur devinée', () => {
    const items = packingFrames(
      [entry('A', { fulfillmentMethod: 'pickup', clientele: 'pro', siteId: null })],
      PALETTE,
    );

    expect(items).toEqual([expect.objectContaining({ category: 'Retrait', color: null })]);
  });
});
