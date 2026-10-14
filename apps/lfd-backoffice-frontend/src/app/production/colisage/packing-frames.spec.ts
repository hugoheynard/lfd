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

function titles(frames: ReturnType<typeof packingFrames>): unknown[] {
  return frames.map((frame) =>
    frame.kind === 'transfer'
      ? [frame.title, frame.frames.map((inner) => inner.title)]
      : frame.title,
  );
}

function references(frame: ReturnType<typeof packingFrames>[number] | undefined): string[] {
  return frame?.kind === 'orders' ? frame.entries.map((e) => e.sheet.reference) : [];
}

describe('packingFrames — les cadres de couleur du colisage (L1b, revus le 2026-10-14)', () => {
  it('un cadre par catégorie de livraison, couleur et encre comprises, commandes dans leur ordre servi', () => {
    const frames = packingFrames(
      [entry('A', {}), entry('B', { clientele: 'public' }), entry('C', {})],
      PALETTE,
    );

    expect(
      frames.map((frame) => frame.kind === 'orders' && [frame.title, frame.color, frame.ink]),
    ).toEqual([
      ['Livraison pro', '#0d47a1', 'light'],
      ['Livraison particulier', null, 'neutral'],
    ]);
    expect(references(frames[0])).toEqual(['A', 'C']);
  });

  /**
   * Régression : « une livraison par cadre » — l'échéance d'une livraison est
   * la fenêtre du client, et le découpage par heure faisait un cadre par
   * commande (Hugo, 2026-10-14).
   */
  it('une livraison par cadre : les livraisons ne se coupent plus par heure', () => {
    const frames = packingFrames(
      [entry('A', { dueAt: '07:00' }), entry('B', { dueAt: '09:30' }), entry('C', { dueAt: null })],
      PALETTE,
    );

    expect(titles(frames)).toEqual(['Livraison pro']);
    expect(references(frames[0])).toEqual(['A', 'B', 'C']);
  });

  it('les retraits sur place gardent leur créneau, rangés par heure', () => {
    const frames = packingFrames(
      [
        entry('A', {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'adroit',
          dueAt: '10:00',
        }),
        entry('B', {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'adroit',
          dueAt: '08:00',
        }),
        entry('C', {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'adroit',
          dueAt: null,
        }),
      ],
      [...PALETTE, ADROIT],
    );

    expect(titles(frames)).toEqual([
      'Retrait particulier Adroit · 08:00',
      'Retrait particulier Adroit · 10:00',
      'Retrait particulier Adroit · sans heure',
    ]);
  });

  it('🔴 un site servi par transfert : UN cadre neutre qui contient ses retraits par clientèle', () => {
    const frames = packingFrames(
      [
        entry('A', {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'vv',
          dueAt: '08:00',
        }),
        entry('B', { fulfillmentMethod: 'pickup', clientele: 'pro', siteId: 'vv', dueAt: '11:00' }),
        entry('C', {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'vv',
          dueAt: '09:00',
        }),
      ],
      PALETTE,
    );

    expect(titles(frames)).toEqual([
      ['Transfert Val Village', ['Retrait pro Val Village', 'Retrait particulier Val Village']],
    ]);
    const transfer = frames[0];
    expect(transfer?.kind === 'transfer' && transfer.frames[1]).toMatchObject({
      color: '#fdd835',
      ink: 'dark',
      entries: [expect.objectContaining({ stop: null }), expect.anything()],
    });
  });

  it('à heure égale (ici aucune), l’ordre fixe départage : transfert, livraisons, retraits', () => {
    const frames = packingFrames(
      [
        entry('R', { fulfillmentMethod: 'pickup', clientele: 'public', siteId: 'adroit' }),
        entry('P', { clientele: 'public' }),
        entry('L', { clientele: 'pro' }),
        entry('T', { fulfillmentMethod: 'pickup', clientele: 'public', siteId: 'vv' }),
      ],
      [...PALETTE, ADROIT],
    );

    expect(titles(frames)).toEqual([
      ['Transfert Val Village', ['Retrait particulier Val Village']],
      'Livraison pro',
      'Livraison particulier',
      'Retrait particulier Adroit',
    ]);
  });

  /**
   * L2 (Hugo, 2026-10-14) : les cadres se rangent par leur heure « prête
   * pour » la plus tôt — ce qui part d'abord se prépare d'abord —, et les
   * commandes d'un cadre par heure. L'ordre FIXE d'avant ne départage plus
   * que les égalités.
   */
  it('range les cadres par leur heure la plus tôt, et les commandes dans chaque cadre', () => {
    const frames = packingFrames(
      [
        entry('L1', { clientele: 'pro', readyBy: '07:10' }),
        entry('R', {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'adroit',
          readyBy: '06:45',
        }),
        entry('L0', { clientele: 'pro', readyBy: null }),
        entry('L2', { clientele: 'pro', readyBy: '05:50' }),
        entry('T', {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'vv',
          readyBy: '06:30',
        }),
      ],
      [...PALETTE, ADROIT],
    );

    expect(titles(frames)).toEqual([
      'Livraison pro',
      ['Transfert Val Village', ['Retrait particulier Val Village']],
      'Retrait particulier Adroit',
    ]);
    // Sans départ (L0) en dernier dans son cadre.
    expect(references(frames[0])).toEqual(['L2', 'L1', 'L0']);
  });

  it('l’heure servie l’emporte sur l’échéance figée : une livraison ne se range pas à sa fenêtre', () => {
    const frames = packingFrames(
      [
        entry('A', { clientele: 'pro', dueAt: '06:00', readyBy: '08:00' }),
        entry('B', { clientele: 'pro', dueAt: '11:00', readyBy: '07:00' }),
      ],
      PALETTE,
    );

    expect(references(frames[0])).toEqual(['B', 'A']);
  });

  it('le réapprovisionnement entre dans le cadre du transfert, et jamais un cadre vide', () => {
    const withItems = packingFrames([], PALETTE, [
      { siteId: 'vv', items: [{ key: 'r1', label: 'Pain de mie × 12' }] },
    ]);
    const empty = packingFrames([], PALETTE, [{ siteId: 'vv', items: [] }]);

    expect(titles(withItems)).toEqual([
      ['Transfert Val Village', ['Réapprovisionnement Val Village']],
    ]);
    expect(empty).toEqual([]);
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
