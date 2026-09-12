import { describe, expect, it } from 'vitest';

import type { ProductionForecastView } from '@lfd/contracts';

import { dayLabel, tomorrowOrders } from '../cockpit-bar/tomorrow-orders';

function view(days: ProductionForecastView['days']): ProductionForecastView {
  return { days, lines: [], peakDate: null, totalUnits: 0 };
}

describe('tomorrowOrders', () => {
  it('extrait la journée demandée', () => {
    const forecast = view([
      { date: '2026-09-12', totalUnits: 100, orderCount: 4, closed: true },
      { date: '2026-09-13', totalUnits: 320, orderCount: 11, closed: false },
    ]);

    expect(tomorrowOrders(forecast, '2026-09-13')).toEqual({
      date: '2026-09-13',
      totalUnits: 320,
      orderCount: 11,
      closed: false,
    });
  });

  it('rend null quand la lecture a échoué', () => {
    // « aucune commande pour demain » et « je n'ai pas pu lire » sont deux
    // nouvelles opposées : retomber sur zéro ferait décrocher le téléphone.
    expect(tomorrowOrders(null, '2026-09-13')).toBeNull();
  });

  it("rend null quand le serveur n'a pas rendu ce jour-là", () => {
    const forecast = view([{ date: '2026-09-12', totalUnits: 1, orderCount: 1, closed: false }]);
    expect(tomorrowOrders(forecast, '2026-09-13')).toBeNull();
  });

  it('reporte une journée arrêtée telle quelle', () => {
    const forecast = view([{ date: '2026-09-13', totalUnits: 80, orderCount: 3, closed: true }]);
    expect(tomorrowOrders(forecast, '2026-09-13')?.closed).toBe(true);
  });
});

describe('dayLabel', () => {
  it('écrit le jour en clair, en français', () => {
    expect(dayLabel('2026-09-13')).toBe('dimanche 13 septembre');
  });

  /**
   * Régression : un jour de service lu en heure LOCALE recule d'une journée à
   * l'ouest de Greenwich — l'écran aurait annoncé le compte de demain sous la
   * date d'aujourd'hui. Le premier du mois est le cas où ça se voit.
   */
  it('ne recule pas d’un jour au premier du mois', () => {
    expect(dayLabel('2026-10-01')).toBe('jeudi 1 octobre');
  });
});
