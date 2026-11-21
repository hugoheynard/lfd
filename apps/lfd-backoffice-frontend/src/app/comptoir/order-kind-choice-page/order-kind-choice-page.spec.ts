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
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(OrderKindChoicePage);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, navigate };
}

describe('Nouvelle commande — le choix', () => {
  it('propose deux cartes, pro et particulier', () => {
    const { el } = mount();
    expect(el.textContent).toContain('Commande pro');
    expect(el.textContent).toContain('Commande particulier');
  });

  it('mène chaque carte à sa saisie', () => {
    const { el, navigate } = mount();
    // L'origine et le point suivent l'étape suivante.
    const keep = { queryParamsHandling: 'preserve' };
    el.querySelector<HTMLElement>('[data-choice-particular]')?.click();
    expect(navigate).toHaveBeenLastCalledWith([PARTICULAR_ORDER_LINK], keep);
    el.querySelector<HTMLElement>('[data-choice-pro]')?.click();
    expect(navigate).toHaveBeenLastCalledWith([PRO_ORDER_LINK], keep);
  });

  it('ramène, par son lien de retour, à l’écran d’où l’on vient', () => {
    const { el } = mount();
    // Sans origine dans l'adresse : la liste des commandes.
    expect(el.querySelector('fold-back-link a')?.getAttribute('href')).toBe('/commandes');
    expect(el.textContent).toContain('Retour aux commandes');
  });
});
