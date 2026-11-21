import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import {
  OrderKindChoicePage,
  PARTICULAR_ORDER_LINK,
  PRO_ORDER_LINK,
} from './order-kind-choice-page';

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(OrderKindChoicePage);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, navigateByUrl };
}

describe('Nouvelle commande — le choix', () => {
  it('propose deux cartes, pro et particulier', () => {
    const { el } = mount();
    expect(el.textContent).toContain('Commande pro');
    expect(el.textContent).toContain('Commande particulier');
  });

  it('mène chaque carte à sa saisie', () => {
    const { el, navigateByUrl } = mount();
    el.querySelector<HTMLElement>('[data-choice-particular]')?.click();
    expect(navigateByUrl).toHaveBeenLastCalledWith(PARTICULAR_ORDER_LINK);
    el.querySelector<HTMLElement>('[data-choice-pro]')?.click();
    expect(navigateByUrl).toHaveBeenLastCalledWith(PRO_ORDER_LINK);
  });

  it('ramène, par son lien de retour, à l’écran d’où l’on vient', () => {
    const { el } = mount();
    // Sans origine dans l'adresse : la liste des commandes.
    expect(el.querySelector('fold-back-link a')?.getAttribute('href')).toBe('/commandes');
    expect(el.textContent).toContain('Retour aux commandes');
  });
});
