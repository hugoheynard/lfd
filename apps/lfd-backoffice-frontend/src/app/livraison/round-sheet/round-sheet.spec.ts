import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { PlannedRound } from '../delivery-planning';
import { stopOf } from '../run-sheet.fixture';
import { RoundSheet, STOP_DRAG_TYPE } from './round-sheet';

const ROUND: PlannedRound = {
  key: 'r-1',
  roundId: 'r-1',
  vehicleId: 'v-1',
  vehicleName: 'Camionnette 1',
  passage: 1,
  lock: null,
  kept: false,
  keptReason: null,
  touched: false,
  timing: {
    departureTime: '06:00',
    returnTime: '08:26',
    meters: 12_100,
    minutes: 146,
    overDuration: false,
  },
  geometry: null,
  stops: [
    {
      orderId: 'o-1',
      reference: 'CMD-1',
      arrival: '06:01',
      window: { start: '07:00', end: '09:00' },
      windowMissed: false,
      sheet: stopOf({ orderId: 'o-1', tradeName: 'Chalet du Laisinant', state: 'ready' }),
    },
    {
      orderId: 'o-2',
      reference: 'CMD-2',
      arrival: '07:55',
      window: { start: '06:00', end: '07:30' },
      windowMissed: true,
      sheet: null,
    },
  ],
};

async function boot(round: PlannedRound, editable = true): Promise<ComponentFixture<RoundSheet>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RoundSheet] });
  const fixture = TestBed.createComponent(RoundSheet);
  fixture.componentRef.setInput('round', round);
  fixture.componentRef.setInput('color', '--fold-color-primary');
  fixture.componentRef.setInput('departureLabel', 'Labo');
  fixture.componentRef.setInput('editable', editable);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<RoundSheet>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

/** Un `DragEvent` porteur d'un arrêt de l'écran — jsdom n'a pas de `DataTransfer`. */
function dragEvent(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: [STOP_DRAG_TYPE], setData: () => undefined, dropEffect: 'none' },
  });
  return event;
}

describe('RoundSheet', () => {
  it('dit le départ, chaque arrêt par le nom du client, et le retour', async () => {
    const fixture = await boot(ROUND);
    const text = host(fixture).textContent;

    expect(host(fixture).querySelector('[data-departure]')?.textContent).toContain('6 h 00');
    expect(text).toContain('Chalet du Laisinant');
    expect(text).toContain('Attend 59 min l’ouverture');
    expect(text).toContain('Arrive après son créneau');
    expect(host(fixture).querySelector('[data-return]')?.textContent).toContain('8 h 26');
  });

  it('lâcher sur une ligne dit le rang visé', async () => {
    const fixture = await boot(ROUND);
    const dropped: number[] = [];
    fixture.componentInstance.dropped.subscribe((index) => dropped.push(index));
    const lines = host(fixture).querySelectorAll('[data-planned-stop]');

    lines[1]?.dispatchEvent(dragEvent('drop'));
    host(fixture).querySelector('[data-run]')?.dispatchEvent(dragEvent('drop'));

    // jsdom n'a pas de mise en page : la ligne mesure 0, on lâche sur sa moitié haute.
    expect(dropped).toEqual([1, 2]);
  });

  it('une tournée chargée ne se prend pas et ne reçoit rien (I6)', async () => {
    const fixture = await boot({ ...ROUND, lock: 'loaded' });
    const dropped: number[] = [];
    fixture.componentInstance.dropped.subscribe((index) => dropped.push(index));

    expect(host(fixture).querySelector('[draggable="true"]')).toBeNull();
    expect(host(fixture).textContent).toContain('Chargée · ne bouge plus');
    host(fixture).querySelector('[data-run]')?.dispatchEvent(dragEvent('drop'));
    expect(dropped).toEqual([]);
  });

  it('sans heures (à re-chronométrer), un tiret plutôt qu’une heure fausse', async () => {
    const fixture = await boot({
      ...ROUND,
      timing: null,
      stops: [{ ...ROUND.stops[0]!, arrival: null }],
    });

    expect(host(fixture).querySelector('[data-departure]')?.textContent).toContain('—');
    expect(host(fixture).querySelector('[data-planned-stop]')?.textContent).toContain('—');
  });
});
