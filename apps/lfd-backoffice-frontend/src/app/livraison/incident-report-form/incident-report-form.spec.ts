import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DeliveryIncidentFamily } from '@lfd/contracts';
import { DELIVERY_INCIDENT_NOTE_MAX } from '@lfd/contracts';
import {
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldTextareaComponent,
  isFoldSelectOptionGroup,
} from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { type IncidentReport, MyDeliveryRoundService } from '../my-delivery-round.service';
import { type CurrentStopRef, IncidentReportForm } from './incident-report-form';

interface Wire {
  readonly sent: IncidentReport[];
  refuse: HttpErrorResponse | null;
  reported: number;
}

async function boot(inputs: {
  families: readonly DeliveryIncidentFamily[];
  stopId?: string | null;
  currentStop?: CurrentStopRef | null;
}): Promise<{ fixture: ComponentFixture<IncidentReportForm>; wire: Wire }> {
  const wire: Wire = { sent: [], refuse: null, reported: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MyDeliveryRoundService,
        useValue: {
          report: (_roundId: string, report: IncidentReport): Promise<string> => {
            wire.sent.push(report);
            return wire.refuse === null ? Promise.resolve('i-1') : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof MyDeliveryRoundService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(IncidentReportForm);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.componentRef.setInput('families', inputs.families);
  fixture.componentRef.setInput('stopId', inputs.stopId ?? null);
  fixture.componentRef.setInput('currentStop', inputs.currentStop ?? null);
  fixture.componentInstance.reported.subscribe(() => (wire.reported += 1));
  await settle(fixture);
  return { fixture, wire };
}

async function settle(fixture: ComponentFixture<IncidentReportForm>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function listbox(
  fixture: ComponentFixture<IncidentReportForm>,
  selector: string,
): FoldListboxComponent<string> {
  return fixture.debugElement.query(By.css(selector))
    .componentInstance as FoldListboxComponent<string>;
}

/** Les valeurs proposées par une liste — options à plat seulement. */
function valuesOf(fixture: ComponentFixture<IncidentReportForm>, selector: string): string[] {
  return (listbox(fixture, selector).options() ?? []).flatMap((item) =>
    isFoldSelectOptionGroup(item) ? [] : [item.value],
  );
}

function send(fixture: ComponentFixture<IncidentReportForm>): HTMLButtonElement {
  const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    '[data-send-incident]',
  );
  if (button === null) {
    throw new Error('bouton introuvable');
  }
  return button;
}

describe('IncidentReportForm', () => {
  it('sur un arrêt : la famille « à la remise » est prise d’office, l’arrêt est fixé', async () => {
    const { fixture, wire } = await boot({ families: ['doorstep'], stopId: 's-1' });
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-family]')).toBeNull();
    expect(valuesOf(fixture, '[data-reason]')).toEqual([
      'nobody_present',
      'refused',
      'address_not_found',
      'access_impossible',
      'goods_damaged',
      'other',
    ]);
    expect(send(fixture).disabled).toBe(true);

    listbox(fixture, '[data-reason]').value.set('refused');
    await settle(fixture);
    send(fixture).click();
    await settle(fixture);

    expect(wire.sent).toEqual([
      { family: 'doorstep', reason: 'refused', note: '', stopId: 's-1', photo: null },
    ]);
    expect(wire.reported).toBe(1);
  });

  it('dans l’en-tête : changer de famille retire le motif, l’arrêt en cours se coche', async () => {
    const { fixture, wire } = await boot({
      families: ['technical', 'road'],
      currentStop: { stopId: 's-2', label: '2. Refuge' },
    });
    listbox(fixture, '[data-family]').value.set('technical');
    await settle(fixture);
    listbox(fixture, '[data-reason]').value.set('cold_failure');
    await settle(fixture);
    listbox(fixture, '[data-family]').value.set('road');
    await settle(fixture);
    expect(send(fixture).disabled).toBe(true);
    expect(valuesOf(fixture, '[data-reason]')).toContain('traffic_jam');

    listbox(fixture, '[data-reason]').value.set('traffic_jam');
    (
      fixture.debugElement.query(By.directive(FoldCheckboxComponent))
        .componentInstance as FoldCheckboxComponent
    ).checked.set(true);
    await settle(fixture);
    send(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]).toMatchObject({ family: 'road', reason: 'traffic_jam', stopId: 's-2' });
  });

  it('sans arrêt coché, un problème de la tournée ne porte aucun arrêt', async () => {
    const { fixture, wire } = await boot({
      families: ['technical', 'road'],
      currentStop: { stopId: 's-2', label: '2. Refuge' },
    });
    listbox(fixture, '[data-family]').value.set('technical');
    await settle(fixture);
    listbox(fixture, '[data-reason]').value.set('vehicle_breakdown');
    await settle(fixture);
    send(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]?.stopId).toBeNull();
  });

  it(`une note de plus de ${DELIVERY_INCIDENT_NOTE_MAX} caractères bloque l’envoi`, async () => {
    const { fixture } = await boot({ families: ['doorstep'], stopId: 's-1' });
    listbox(fixture, '[data-reason]').value.set('other');
    (
      fixture.debugElement.query(By.directive(FoldTextareaComponent))
        .componentInstance as FoldTextareaComponent
    ).value.set('x'.repeat(DELIVERY_INCIDENT_NOTE_MAX + 1));
    await settle(fixture);

    expect(send(fixture).disabled).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-note-too-long]'),
    ).not.toBeNull();
  });

  it('un refus s’affiche tel quel, et le formulaire reste ouvert', async () => {
    const { fixture, wire } = await boot({ families: ['doorstep'], stopId: 's-1' });
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Cette tournée est rentrée.' },
    });
    listbox(fixture, '[data-reason]').value.set('refused');
    await settle(fixture);
    send(fixture).click();
    await settle(fixture);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-report-refusal]')?.textContent,
    ).toContain('Cette tournée est rentrée.');
    expect(wire.reported).toBe(0);
  });
});
