import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MyLoyaltyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientLoyalty } from '../../client-loyalty.service';
import { EMPTY_LOYALTY } from '../../client-loyalty.fixture';
import { FidelitePage } from './fidelite-page';

/** Un service doublé : la page ne fait que choisir entre la carte et « pas ici ». */
function render(view: MyLoyaltyView | null): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FidelitePage],
    providers: [
      provideRouter([]),
      {
        provide: ClientLoyalty,
        useValue: {
          view: signal(view),
          status: signal(view === null ? 'loading' : 'ready'),
          isOpen: signal(view?.open === true),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(FidelitePage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FidelitePage', () => {
  it('montre la carte quand le programme est ouvert', () => {
    const el = render(EMPTY_LOYALTY);
    expect(el.querySelector('app-loyalty-card')).not.toBeNull();
  });

  it('attend sous la carte tant que rien n’est lu', () => {
    expect(render(null).querySelector('app-loyalty-card fold-loading')).not.toBeNull();
  });

  /** Programme fermé, arrivé par un favori : un état vide, jamais « bientôt ». */
  it('dit que le programme n’est pas ouvert, sans « bientôt »', () => {
    const el = render({ open: false });
    expect(el.querySelector('app-loyalty-card')).toBeNull();
    expect(el.querySelector('fold-empty-state')?.textContent).toContain(
      'Le programme de fidélité n’est pas ouvert.',
    );
    expect(el.textContent).not.toMatch(/bientôt/i);
  });
});
