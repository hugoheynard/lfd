import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ParticularDeliveryFields } from './particular-delivery-fields';

describe('ParticularDeliveryFields — l’adresse dictée d’une livraison offerte', () => {
  it('met à jour un champ de l’adresse sans toucher les autres', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ParticularDeliveryFields);
    fixture.componentInstance.address.set({ ligne1: '1 rue', codePostal: '', ville: 'Paris' });
    fixture.detectChanges();

    fixture.componentInstance['onField']('codePostal', '75011');

    expect(fixture.componentInstance.address()).toEqual({
      ligne1: '1 rue',
      codePostal: '75011',
      ville: 'Paris',
    });
  });

  it('tient les deux bornes de la tranche séparément', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ParticularDeliveryFields);
    fixture.detectChanges();

    fixture.componentInstance['onBound']('end', '11:00');

    expect(fixture.componentInstance.window()).toEqual({ start: '', end: '11:00' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-delivery-street]')).not.toBeNull();
    expect(el.querySelector('[data-delivery-end]')).not.toBeNull();
  });
});
