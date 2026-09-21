import type { CustomerOrderLineView, CustomerOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LIVE_PICKUP } from '../mes-commandes/order-view.fixture';
import { orderLinesSummary, orderPlaceLabel, orderWeekday } from './last-order-summary';

const line = (productName: string, quantity: number): CustomerOrderLineView => ({
  ...LIVE_PICKUP.lines[0]!,
  productName,
  quantity,
});

const more = (count: number): string => `+${count}`;

/** Un mercredi arbitraire : ici les dates ne sont comparées QU'ENTRE ELLES. */
const NOW = new Date('2026-09-16T10:00:00.000Z');
const daysBefore = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('orderWeekday', () => {
  it('nomme le jour d’une commande de cette semaine', () => {
    expect(orderWeekday(daysBefore(2), NOW, 'fr')).toBe('lundi');
  });

  /**
   * 🔴 LA LIMITE EST À SEPT JOURS, et c'est tout l'objet de la fonction :
   * « comme mardi dernier » pour une commande d'il y a trois semaines désigne un
   * mardi que le client n'a pas vécu.
   */
  it('ne nomme AUCUN jour au-delà d’une semaine', () => {
    expect(orderWeekday(daysBefore(7), NOW, 'fr')).toBeNull();
    expect(orderWeekday(daysBefore(30), NOW, 'fr')).toBeNull();
  });

  it('nomme le jour dans la langue lue', () => {
    expect(orderWeekday(daysBefore(2), NOW, 'en')).toBe('Monday');
  });

  /** Une date illisible ne devient pas « Invalid Date » : elle ne dit rien. */
  it('ne dit rien d’une date illisible ou à venir', () => {
    expect(orderWeekday('pas-une-date', NOW, 'fr')).toBeNull();
    expect(orderWeekday(daysBefore(-3), NOW, 'fr')).toBeNull();
  });
});

describe('orderLinesSummary', () => {
  it('nomme les articles avec leur quantité', () => {
    expect(orderLinesSummary([line('traditions', 2), line('croissants', 4)], more)).toBe(
      '2 traditions, 4 croissants',
    );
  });

  /**
   * 🔴 Couper à trois SANS LE DIRE ferait croire que la commande en tenait
   * trois — et c'est le nombre, pas la liste, qui décide si on reprend la même
   * chose.
   */
  it('compte ce qu’elle ne nomme pas', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'].map((name) => line(name, 1));

    expect(orderLinesSummary(lines, more)).toBe('1 a, 1 b, 1 c +2');
  });

  it('ne dit rien d’une commande sans ligne', () => {
    expect(orderLinesSummary([], more)).toBe('');
  });
});

describe('orderPlaceLabel', () => {
  const pickup = (place: string): string => `retrait : ${place}`;

  it('nomme le point de retrait tel que la commande l’a gardé', () => {
    expect(orderPlaceLabel(LIVE_PICKUP, pickup, 'en livraison')).toBe('retrait : Le Labo');
  });

  it('dit la livraison sans nommer de lieu', () => {
    const livree: CustomerOrderView = { ...LIVE_PICKUP, fulfillmentMethod: 'delivery' };

    expect(orderPlaceLabel(livree, pickup, 'en livraison')).toBe('en livraison');
  });

  /**
   * 🔴 Sans libellé NI ville dans le snapshot, on ne nomme pas le lieu plutôt
   * que d'en nommer un autre — le carnet d'aujourd'hui ne dit pas où la
   * commande a été retirée hier.
   */
  it('ne nomme aucun lieu quand le snapshot n’en porte pas', () => {
    const muette: CustomerOrderView = { ...LIVE_PICKUP, pickupAddress: null };

    expect(orderPlaceLabel(muette, pickup, 'en livraison')).toBe('');
  });
});
