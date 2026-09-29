import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { PlannedRound } from '../delivery-planning';
import { MAP_TILES } from '../map-tiles.config';
import { DeliveryMap } from './delivery-map';

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
});
