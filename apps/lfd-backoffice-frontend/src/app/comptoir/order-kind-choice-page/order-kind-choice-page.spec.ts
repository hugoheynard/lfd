import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import {
  OrderKindChoicePage,
  PARTICULAR_ORDER_LINK,
  PRO_ORDER_LINK,
} from './order-kind-choice-page';

function mount() {
  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { navigateByUrl } }] });
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
});
