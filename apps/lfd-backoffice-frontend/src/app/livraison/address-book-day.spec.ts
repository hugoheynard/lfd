import type { DeliveryDayAddressOrder } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { dayAddressLinesOf, deliveryTimesOf, windowLabelOf } from './address-book-day';
import { addressBookRowOf } from './address-book.fixture';

function orderOf(overrides: Partial<DeliveryDayAddressOrder> = {}): DeliveryDayAddressOrder {
  return {
    orderId: 'o1',
    reference: 'C-1',
    customerLabel: 'Hôtel du Parc SAS',
    companyId: 'c1',
    addressId: 'a1',
    address: {
      label: '',
      ligne1: '3 rue figée',
      ligne2: '',
      codePostal: '73000',
      ville: 'Chambéry',
      pays: 'France',
    },
    window: { start: null, end: '10:00' },
    ...overrides,
  };
}

describe('deliveryTimesOf', () => {
  it('dit les échéances de tous les jours, ou jour par jour', () => {
    expect(
      deliveryTimesOf(
        addressBookRowOf({
          windowMode: 'deadline',
          deadlines: { mode: 'everyday', times: ['06:00', '11:00'] },
        }),
      ),
    ).toEqual({ mode: 'Échéances', lines: ['Tous les jours : 06:00 · 11:00'] });
    expect(
      deliveryTimesOf(
        addressBookRowOf({
          windowMode: 'deadline',
          deadlines: {
            mode: 'perDay',
            byDay: {
              mon: ['06:00'],
              tue: null,
              wed: null,
              thu: null,
              fri: ['07:00', '12:00'],
              sat: null,
              sun: null,
            },
          },
        }),
      ).lines,
    ).toEqual(['Lun : 06:00', 'Ven : 07:00 · 12:00']);
  });

  it('dit les créneaux en mode créneau, et « aucun » par une liste vide', () => {
    expect(
      deliveryTimesOf(
        addressBookRowOf({
          windowMode: 'slot',
          slots: { mode: 'everyday', slots: [{ start: '08:00', end: '10:00' }] },
        }),
      ),
    ).toEqual({ mode: 'Créneaux', lines: ['Tous les jours : 08:00–10:00'] });
    expect(deliveryTimesOf(addressBookRowOf({ windowMode: 'slot' })).lines).toEqual([]);
  });

  it('au réglage global, montre les échéances, ou à défaut les créneaux', () => {
    const slots = { mode: 'everyday' as const, slots: [{ start: '08:00', end: '10:00' }] };
    expect(deliveryTimesOf(addressBookRowOf({ windowMode: null, slots }))).toEqual({
      mode: 'Réglage global',
      lines: ['Tous les jours : 08:00–10:00'],
    });
    expect(
      deliveryTimesOf(
        addressBookRowOf({
          windowMode: null,
          slots,
          deadlines: { mode: 'everyday', times: ['09:00'] },
        }),
      ).lines,
    ).toEqual(['Tous les jours : 09:00']);
  });
});

describe('windowLabelOf', () => {
  it('écrit une échéance, un créneau, ou son absence', () => {
    expect(windowLabelOf({ start: null, end: '10:00' })).toBe('avant 10:00');
    expect(windowLabelOf({ start: '08:00', end: '10:00' })).toBe('08:00–10:00');
    expect(windowLabelOf(null)).toBe('Sans heure');
  });
});

describe('dayAddressLinesOf', () => {
  const book = [
    addressBookRowOf(),
    addressBookRowOf({ addressId: 'a2', tradeName: '', legalName: 'Café Bastille' }),
  ];

  it('classe par heure, et met les livraisons sans heure à la fin', () => {
    const lines = dayAddressLinesOf(book, [
      orderOf({ orderId: 'o1', reference: 'C-1', window: null }),
      orderOf({
        orderId: 'o2',
        reference: 'C-2',
        addressId: 'a2',
        window: { start: null, end: '11:00' },
      }),
      orderOf({ orderId: 'o3', reference: 'C-3', window: { start: '07:00', end: '09:00' } }),
    ]);
    expect(lines.map((line) => [line.timeLabel, line.references])).toEqual([
      ['07:00–09:00', ['C-3']],
      ['avant 11:00', ['C-2']],
      ['Sans heure', ['C-1']],
    ]);
  });

  it('réunit les commandes d’une même adresse à la même heure, et prend les consignes du carnet', () => {
    const lines = dayAddressLinesOf(book, [
      orderOf({ orderId: 'o1', reference: 'C-1' }),
      orderOf({ orderId: 'o2', reference: 'C-2' }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      references: ['C-1', 'C-2'],
      tradeName: 'Hôtel du Parc',
      ligne1: book[0]?.ligne1,
    });
  });

  it('une commande hors du carnet, ou d’une autre société, montre l’adresse qu’elle a figée', () => {
    const lines = dayAddressLinesOf(book, [
      orderOf({ orderId: 'o1', addressId: null, companyId: null, customerLabel: 'Léa Martin' }),
      orderOf({ orderId: 'o2', reference: 'C-2', companyId: 'autre', window: null }),
    ]);
    expect(lines.map((line) => [line.legalName, line.ligne1, line.door])).toEqual([
      ['Léa Martin', '3 rue figée', null],
      ['Hôtel du Parc SAS', '3 rue figée', null],
    ]);
  });
});
