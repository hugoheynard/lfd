import type { PackingSheet, SitePaletteEntryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { packingFrames } from './packing-frames';
import type { PackingEntry } from './packing-rounds';

const NO_COLORS = {
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
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
  overrides: Partial<Pick<PackingSheet, 'fulfillmentMethod' | 'clientele' | 'siteId' | 'dueAt'>>,
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
  canDeclareReady: false,
  coldOutsideIsotherm: [],
  packedAt: null,
  packedBy: null,
  packedByName: null,
  qualityHeld: false,
  containerMode: 'listed',
  containerList: [],
};

describe('packingFrames — les cadres de couleur du colisage (L1b)', () => {
  it('un cadre par catégorie, dans l’ordre de sa première commande, couleur et encre comprises', () => {
    const frames = packingFrames(
      [
        entry('A', {}),
        entry('B', { fulfillmentMethod: 'pickup', clientele: 'public', siteId: 'vv' }),
        entry('C', {}),
      ],
      PALETTE,
    );

    expect(frames.map((frame) => [frame.title, frame.color, frame.ink])).toEqual([
      ['Livraison pro', '#0d47a1', 'light'],
      ['Transfert Val Village · particulier', '#fdd835', 'dark'],
    ]);
    expect(frames[0]?.entries.map((e) => e.sheet.reference)).toEqual(['A', 'C']);
  });

  it('une catégorie à plusieurs échéances se coupe par tranche, et le titre le dit', () => {
    const frames = packingFrames(
      [entry('A', { dueAt: '07:00' }), entry('B', { dueAt: '09:30' }), entry('C', { dueAt: null })],
      PALETTE,
    );

    expect(frames.map((frame) => frame.title)).toEqual([
      'Livraison pro · 07:00',
      'Livraison pro · 09:30',
      'Livraison pro · sans heure',
    ]);
  });

  it('une seule échéance : un seul cadre, sans heure dans le titre', () => {
    const frames = packingFrames(
      [entry('A', { dueAt: '07:00' }), entry('B', { dueAt: '07:00' })],
      PALETTE,
    );

    expect(frames.map((frame) => frame.title)).toEqual(['Livraison pro']);
  });

  it('🔴 sans site, sans clientèle : un cadre NEUTRE, jamais une couleur devinée', () => {
    const frames = packingFrames(
      [entry('A', { fulfillmentMethod: 'pickup', clientele: 'pro', siteId: null })],
      PALETTE,
    );

    expect(frames).toEqual([
      expect.objectContaining({ title: 'Retrait', color: null, ink: 'neutral' }),
    ]);
  });
});
