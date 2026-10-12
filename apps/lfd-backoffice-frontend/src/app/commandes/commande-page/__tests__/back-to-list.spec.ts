import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FoldBackLinkComponent, FoldPageLayoutComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { FROM_ORDER_LIST } from '../../order-list-return';
import { AdminCommandePage } from '../commande-page';

/**
 * **Le retour du détail garde les filtres de la liste.** `fold-back-link` ne
 * porte pas de queryParams : venue de la liste, la page remonte l'historique
 * (l'entrée précédente EST la liste filtrée) ; ouverte autrement, elle mène à
 * la liste nue — jamais aux comptes clients, où elle menait avant C2.
 */

@Component({ template: '' })
class Blank {}

async function harness(): Promise<RouterTestingHarness> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'commandes', component: Blank },
          { path: 'commandes/:orderId', component: AdminCommandePage },
        ],
        withComponentInputBinding(),
      ),
      provideLocationMocks(),
    ],
  });
  // Le corps (`app-order-view`) charge la commande : il n'est pas le sujet ici.
  TestBed.overrideComponent(AdminCommandePage, {
    set: { imports: [FoldBackLinkComponent, FoldPageLayoutComponent], schemas: [NO_ERRORS_SCHEMA] },
  });
  const harness = await RouterTestingHarness.create();
  // Le routeur n'écoute l'historique (popstate) qu'après sa navigation initiale.
  TestBed.inject(Router).initialNavigation();
  return harness;
}

function back(h: RouterTestingHarness): Element {
  const link = (h.fixture.nativeElement as HTMLElement).querySelector('fold-back-link[data-back]');
  if (link === null) {
    throw new Error('le retour manque');
  }
  return link;
}

describe('AdminCommandePage — le retour vers la liste', () => {
  it("venue de la liste filtrée, il remonte l'historique et la retrouve telle quelle", async () => {
    const h = await harness();
    await h.navigateByUrl('/commandes?clientele=pro&method=delivery');
    await TestBed.inject(Router).navigate(['/commandes', 'o_1'], {
      state: { [FROM_ORDER_LIST]: true },
    });
    h.detectChanges();
    // Le mode historique de fold : un bouton, sans cible figée.
    expect(back(h).querySelector('button')).not.toBeNull();
    expect(back(h).querySelector('a')).toBeNull();

    (back(h).querySelector('button') as HTMLButtonElement).click();
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await h.fixture.whenStable();
    }
    expect(TestBed.inject(Location).path()).toBe('/commandes?clientele=pro&method=delivery');
    expect(TestBed.inject(Router).url).toBe('/commandes?clientele=pro&method=delivery');
  });

  it('ouverte par un lien direct, elle mène à la liste des commandes', async () => {
    const h = await harness();
    await h.navigateByUrl('/commandes/o_1');
    expect(back(h).querySelector('a')?.getAttribute('href')).toBe('/commandes');
    expect(back(h).textContent).toContain('Commandes');
  });
});
