import { describe, expect, it } from 'vitest';

import { atPoint, isFinished, pickupPoints, slotLayout } from './handover-layout';
import { groupOf } from './handover-slots';
import type { SlotClock, SlotRow } from './handover-slots';

function row(reference: string, overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    state: 'ready',
    time: null,
    totalUnits: 1,
    pickupLabel: 'Le Labo',
    handedOverAt: null,
    readyAt: null,
    overdueMinutes: null,
    overdueCause: null,
    method: 'pickup',
    heldForQuality: false,
    ...overrides,
  };
}

const handed = (reference: string) => row(reference, { state: 'handed_over' });
const AT_7_55: SlotClock = { minutes: 7 * 60 + 55, label: '7 h 55' };

const kinds = (items: ReturnType<typeof slotLayout>) =>
  items.map((item) => (item.kind === 'group' ? item.group.key : item.kind));

describe('slotLayout (Supervision v2, A8)', () => {
  const groups = [
    groupOf('h06', [handed('A'), handed('B')]),
    groupOf('h07', [handed('C'), row('D')]),
    groupOf('h08', [row('E')]),
    groupOf('opening', [row('F')]),
  ];

  it('pose « Maintenant » avant la première tranche pas commencée, les terminées en bas', () => {
    expect(kinds(slotLayout(groups, AT_7_55))).toEqual([
      'h07',
      'now',
      'h08',
      'opening',
      'finished',
      'h06',
    ]);
  });

  it('une tranche en cours toute remise n’est pas « terminée »', () => {
    expect(isFinished(groupOf('h07', [handed('C')]), AT_7_55)).toBe(false);
  });

  it('une annulée ne retient pas une tranche passée', () => {
    expect(
      isFinished(groupOf('h06', [handed('A'), row('X', { state: 'cancelled' })]), AT_7_55),
    ).toBe(true);
  });

  it('sans heure de lecture : ni repère, ni tranche terminée', () => {
    expect(kinds(slotLayout(groups, undefined))).toEqual(['h06', 'h07', 'h08', 'opening']);
  });

  it('un jour passé replie ses tranches, sans repère', () => {
    expect(kinds(slotLayout(groups, { minutes: Infinity, label: null }))).toEqual([
      'h07',
      'h08',
      'opening',
      'finished',
      'h06',
    ]);
  });

  it('le repère se pose en fin quand tout a commencé, et jamais sur une colonne vide', () => {
    expect(kinds(slotLayout([groupOf('h06', [row('A')])], AT_7_55))).toEqual(['h06', 'now']);
    expect(slotLayout([], AT_7_55)).toEqual([]);
  });
});

describe('le filtre par point de retrait (A4)', () => {
  const groups = [
    groupOf('h07', [row('A'), row('B', { pickupLabel: 'Centre' }), handed('C')]),
    groupOf('h08', [row('D', { pickupLabel: 'Centre', state: 'cancelled' })]),
  ];

  it('recalcule les comptes et retire les tranches vides', () => {
    const [only, ...rest] = atPoint(groups, 'Le Labo');

    expect(rest).toEqual([]);
    expect(only).toMatchObject({ key: 'h07', expected: 2, handedOver: 1 });
  });

  it('liste les points avec leur compte, annulées exclues', () => {
    expect(pickupPoints(groups)).toEqual([
      { label: 'Centre', count: 1 },
      { label: 'Le Labo', count: 2 },
    ]);
  });
});
