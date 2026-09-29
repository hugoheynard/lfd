import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { PlannedRound } from '../delivery-planning';
import { MAP_TILES } from '../map-tiles.config';
import { stopOf } from '../run-sheet.fixture';
import { DeliveryMap, townsOf } from './delivery-map';

function round(stops: PlannedRound['stops']): PlannedRound {
  return {
    key: 'r-1',
    roundId: 'r-1',
    vehicleId: 'v-1',
    vehicleName: 'Camionnette 1',
    passage: 1,
    lock: null,
    kept: false,
    keptReason: null,
    touched: false,
    timing: null,
    geometry: null,
    stops,
  };
}

function stopAt(
  orderId: string,
  ville: string,
  lat: number,
  lng: number,
): PlannedRound['stops'][number] {
  const sheet = stopOf({ orderId });
  return {
    orderId,
    reference: orderId,
    arrival: null,
    window: null,
    windowMissed: false,
    sheet: {
      ...sheet,
      address: sheet.address === null ? null : { ...sheet.address, ville },
      addressBook: {
        companyId: 'co-1',
        addressId: 'a-1',
        note: '',
        gps: { lat, lng },
        procedure: [],
      },
    },
  };
}

describe('DeliveryMap', () => {
  it('sans URL de tuiles : pas de carte, et l’écran le dit sans charger MapLibre', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DeliveryMap],
      providers: [{ provide: MAP_TILES, useValue: { baseUrl: '', wholeFile: false } }],
    });
    const fixture: ComponentFixture<DeliveryMap> = TestBed.createComponent(DeliveryMap);
    fixture.componentRef.setInput('rounds', [round([])]);
    fixture.componentRef.setInput('departure', { label: 'Labo', gps: { lat: 45.44, lng: 6.98 } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-map-absent]')).not.toBeNull();
    expect(element.querySelector('.delivery-map__canvas')?.hasAttribute('hidden')).toBe(true);
  });

  it('place chaque ville desservie au centre de ses arrêts, et seulement celles-là', () => {
    const towns = townsOf([
      round([
        stopAt('o-1', 'Val d’Isère', 45.44, 6.98),
        stopAt('o-2', 'Val d’Isère', 45.46, 7.0),
        stopAt('o-3', 'Tignes', 45.47, 6.9),
      ]),
    ]);

    expect(towns.map((town) => town.name)).toEqual(['Val d’Isère', 'Tignes']);
    expect(towns[0]?.at.lat).toBeCloseTo(45.45);
    expect(towns[0]?.at.lng).toBeCloseTo(6.99);
  });
});
