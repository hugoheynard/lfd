import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { RescheduleCommerceOperationPayload } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { commerceOperation } from '../commerce-operation.testing';
import { CommerceOperationsService } from '../commerce-operations.service';
import { CommerceScheduleCard } from './commerce-schedule-card';

function setup(reschedule: () => Promise<void> = async () => undefined, locked = false) {
  const sent: RescheduleCommerceOperationPayload[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CommerceOperationsService,
        useValue: {
          reschedule: (_key: string, payload: RescheduleCommerceOperationPayload) => {
            sent.push(payload);
            return reschedule();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CommerceScheduleCard);
  fixture.componentRef.setInput('operation', commerceOperation());
  fixture.componentRef.setInput('locked', locked);
  fixture.detectChanges();
  const saved: string[] = [];
  fixture.componentInstance.saved.subscribe((message) => saved.push(message));
  return { fixture, card: fixture.componentInstance, sent, saved };
}

describe('CommerceScheduleCard', () => {
  it('lit le cycle enregistré en heure de Paris', () => {
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('à partir du dim. 15 nov. 2026 à 10:00');
    expect(text).toContain("dès l'annonce, jusqu'au lun. 21 déc. 2026 à 12:00");
  });

  it('repart de ce qui est enregistré : rien à envoyer', () => {
    const { card } = setup();
    expect(card['changed']()).toBe(false);
    expect(card['draft']().announceTime).toBe('10:00');
  });

  /**
   * La clôture déplacée au lundi 26 octobre, au lendemain de la bascule à
   * l'heure d'hiver : 12 h à Paris est 11 h UTC, plus 10 h comme la veille.
   */
  it('envoie les cinq dates, converties à l’heure de Paris du jour saisi', async () => {
    const { card, sent, saved } = setup();
    card['draft'].update((draft) => ({
      ...draft,
      orderUntilDay: '2026-10-26',
      orderUntilTime: '12:00',
    }));
    expect(card['changed']()).toBe(true);
    await card['save']();
    expect(sent[0]).toEqual({
      announceFrom: '2026-11-15T09:00:00.000Z',
      orderFrom: null,
      orderUntil: '2026-10-26T11:00:00.000Z',
      pickupFrom: '2026-12-23',
      pickupUntil: '2026-12-24',
      showsOrderUntilTime: true,
    });
    expect(saved).toEqual(['Calendrier enregistré.']);
  });

  it('éteindre l’heure de clôture suffit à enregistrer, et part avec les dates', async () => {
    const { card, sent } = setup();
    card['showsOrderUntilTime'].set(false);
    expect(card['changed']()).toBe(true);
    await card['save']();
    expect(sent[0]).toMatchObject({
      orderUntil: '2026-12-21T11:00:00.000Z',
      showsOrderUntilTime: false,
    });
  });

  it('la case part de ce que la vue dit', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: CommerceOperationsService, useValue: {} }],
    });
    const fixture = TestBed.createComponent(CommerceScheduleCard);
    fixture.componentRef.setInput('operation', commerceOperation({ showsOrderUntilTime: false }));
    fixture.detectChanges();
    expect(fixture.componentInstance['showsOrderUntilTime']()).toBe(false);
    expect(fixture.componentInstance['changed']()).toBe(false);
  });

  it('un refus d’ordre garde la phrase du serveur, qui nomme les dates', async () => {
    const message = 'Les commandes fermeraient (…) avant d’avoir ouvert (…).';
    const { card } = setup(async () => {
      throw new HttpErrorResponse({
        status: 400,
        error: { code: 'operations.order_window_empty', message },
      });
    });
    card['draft'].update((draft) => ({ ...draft, orderUntilTime: '13:00' }));
    await card['save']();
    expect(card['refusal']()).toBe(message);
  });

  it('archivée, la carte se lit sans formulaire ni Enregistrer', () => {
    const { fixture } = setup(undefined, true);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-schedule-form')).toBeNull();
    expect(root.textContent).not.toContain('Enregistrer');
  });
});
