import { localToInstant } from '@lfd/contracts';
import type { DayInternalTransferView, SitePaletteEntryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { groupOf } from './handover-slots';
import { transferRowsOf, withTransferSlots } from './handover-transfers';

// Un jour comparé seulement aux instants de la fixture, jamais à l'horloge.
const DAY = '2030-03-12';
const at = (day: string, time: string): string => localToInstant(day, time)?.toISOString() ?? '';

const TRANSFER: DayInternalTransferView = {
  transferId: 'tr',
  siteId: 'vv',
  siteLabel: 'Le Village',
  departedAt: null,
  plannedDepartureAt: at(DAY, '06:45'),
  placed: true,
  orderCount: 1,
  resupplyCount: 2,
  binCount: 1,
};

const SITE: SitePaletteEntryView = {
  id: 'vv',
  label: 'Le Village',
  supply: 'transfer',
  isDeparture: false,
  pickupColorB2b: null,
  pickupColorB2c: '#fdd835',
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  resupplyColor: null,
  transferColor: '#7c3aed',
};

const rowsOf = (transfer: DayInternalTransferView, palette = [SITE]) =>
  transferRowsOf({ day: DAY, transfers: [transfer] }, palette);

describe('transferRowsOf — la ligne du transfert', () => {
  it('rangée à l’échéance de son départ requis, et à la couleur du transfert du site', () => {
    const [one] = rowsOf(TRANSFER);
    expect(one?.key).toBe('d06:45');
    expect(one?.row).toMatchObject({
      time: '6 h 45',
      contents: '1 commande · 2 réassorts · 1 sac',
      state: 'En attente du départ',
      mode: { label: 'Transfert Le Village', color: '#7c3aed' },
    });
  });

  it('site inconnu de la palette : teinte neutre, jamais devinée', () => {
    expect(rowsOf(TRANSFER, [])[0]?.row.mode.color).toBeNull();
  });

  it('pas dans une tournée : « Sans créneau » ; un départ d’un autre jour ne range pas', () => {
    expect(rowsOf({ ...TRANSFER, plannedDepartureAt: null, placed: false })[0]).toMatchObject({
      key: 'none',
      row: { time: null, state: 'Pas encore dans une tournée' },
    });
    expect(rowsOf({ ...TRANSFER, plannedDepartureAt: at('2030-03-11', '22:00') })[0]?.key).toBe(
      'none',
    );
  });

  it('parti sans départ prévu : rangé à son départ réel', () => {
    const [one] = rowsOf({ ...TRANSFER, plannedDepartureAt: null, departedAt: at(DAY, '06:52') });
    expect(one?.key).toBe('d06:52');
    expect(one?.row.state).toBe('Parti à 6 h 52');
  });

  it('aucune vue : aucune ligne', () => {
    expect(transferRowsOf(null, [SITE])).toEqual([]);
  });
});

describe('withTransferSlots — une tranche de plus, à son rang', () => {
  it('ajoute la tranche absente dans l’ordre du jour, sans toucher aux autres', () => {
    const groups = [groupOf('d07:30', []), groupOf('none', [])];
    const keys = withTransferSlots(groups, rowsOf(TRANSFER)).map((group) => group.key);
    expect(keys).toEqual(['d06:45', 'd07:30', 'none']);
  });

  it('une tranche existante reste la même', () => {
    const groups = [groupOf('d06:45', [])];
    expect(withTransferSlots(groups, rowsOf(TRANSFER))).toBe(groups);
  });
});
