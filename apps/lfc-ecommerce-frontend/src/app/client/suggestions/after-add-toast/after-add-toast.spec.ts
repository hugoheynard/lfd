import { TestBed } from '@angular/core/testing';

import { Router } from '@angular/router';

import { PieceRequest } from '../../shop/piece-request.service';
import { AfterAddSuggestion } from '../after-add-suggestion.service';
import { answerCart, bootAfterAdd, cartPick } from '../after-add-suggestion.fixture';
import { AfterAddToast } from './after-add-toast';

describe('AfterAddToast', () => {
  it('rien sans proposition', () => {
    bootAfterAdd([AfterAddToast]);
    const fixture = TestBed.createComponent(AfterAddToast);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('fold-toast')).toBeNull();
  });

  it('le « + » de la carte ajoute l’article et ferme le retour', async () => {
    const { cart, entries, http } = bootAfterAdd([AfterAddToast]);
    const fixture = TestBed.createComponent(AfterAddToast);
    fixture.detectChanges();
    entries.entered('VIE-001');
    await answerCart(http, [cartPick('PAI-001')]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('app-staff-suggestion-card button.add')?.click();
    TestBed.tick();
    fixture.detectChanges();

    expect(cart.quantityOf('PAI-001')).toBe(1);
    expect(TestBed.inject(AfterAddSuggestion).current()).toBeNull();
    expect(root.querySelector('fold-toast')).toBeNull();
  });

  it('un clic sur la carte ferme le retour et demande la fiche, sans rien ajouter', async () => {
    const { cart, entries, http, audience } = bootAfterAdd([AfterAddToast]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AfterAddToast);
    fixture.detectChanges();
    entries.entered('VIE-001');
    await answerCart(http, [cartPick('PAI-001')]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('app-staff-suggestion-card button.pitch')?.click();
    TestBed.tick();
    fixture.detectChanges();

    expect(cart.quantityOf('PAI-001')).toBe(0);
    expect(TestBed.inject(PieceRequest).latest()?.sku).toBe('PAI-001');
    expect(navigate).toHaveBeenCalledWith(['/boutique']);
    expect(root.querySelector('fold-toast')).toBeNull();
    expect(audience.events.map(({ event }) => event)).toEqual([
      'suggestion_shown',
      'suggestion_clicked',
    ]);
  });
});
