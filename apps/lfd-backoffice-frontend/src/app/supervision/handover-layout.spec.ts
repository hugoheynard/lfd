import { describe, expect, it } from 'vitest';

import { atRoutes, isFinished, liveRows, slotLayout } from './handover-layout';
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
    clientele: 'pro',
    siteId: 'labo',
    handedOverAt: null,
    readyAt: null,
    overdueMinutes: null,
    overdueCause: null,
    method: 'pickup',
    heldForQuality: false,
    roundLine: null,
    departedAt: null,
    loaded: false,
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

describe('le filtre d’acheminement (A4, multi-sélection depuis le 2026-11-01)', () => {
  const modeOf = (r: SlotRow) => ({
    key: r.pickupLabel ?? '',
    label: `Retrait ${r.pickupLabel ?? ''}`,
    color: null,
  });
  const groups = [
    groupOf('h07', [row('A'), row('B', { pickupLabel: 'Centre' }), handed('C')]),
    groupOf('h08', [row('D', { pickupLabel: 'Centre', state: 'cancelled' })]),
  ];

  it('recalcule les comptes et retire les tranches vides', () => {
    const [only, ...rest] = atRoutes(groups, ['Retrait Le Labo'], modeOf);

    expect(rest).toEqual([]);
    expect(only).toMatchObject({ key: 'h07', expected: 2, handedOver: 1 });
  });

  it('rien de coché = toutes les tranches', () => {
    expect(atRoutes(groups, [], modeOf)).toHaveLength(2);
  });

  it('les lignes à compter excluent les annulées', () => {
    expect(liveRows(groups).map((r) => r.reference)).toEqual(['A', 'B', 'C']);
  });
});
