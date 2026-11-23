import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { OfferReasonFields } from './offer-reason-fields';

describe('OfferReasonFields — le motif d’une commande offerte', () => {
  it('montre la nature, le motif et l’accord pour prévenir le client', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(OfferReasonFields);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-offer-nature]')).not.toBeNull();
    expect(el.querySelector('[data-offer-note]')).not.toBeNull();
    expect(el.querySelector('[data-offer-notify]')).not.toBeNull();
    expect(el.textContent).toContain('ni facturée ni prélevée');
  });

  it('compte les caractères du motif rogné', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(OfferReasonFields);
    fixture.componentInstance.note.set('  Salon  ');
    fixture.detectChanges();

    expect(fixture.componentInstance['noteHint']()).toContain('5 /');
  });

  it('remonte la nature choisie', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(OfferReasonFields);
    fixture.detectChanges();

    fixture.componentInstance['onNature']('sample');

    expect(fixture.componentInstance.nature()).toBe('sample');
  });
});
