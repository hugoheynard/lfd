import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ClientCart } from '../../cart/client-cart.service';
import { ProductAudience } from '../../audience/product-audience.service';
import { PieceQuantity } from '../piece-quantity.service';
import { PieceRequest } from '../piece-request.service';
import { ShopCatalogue } from '../shop-catalogue.store';
import { PieceSheetHost } from './piece-sheet-host';

/**
 * Régression : un incontournable de « Bienvenue » ouvrait sa fiche en menant
 * à la boutique en arrière-plan (relevé en production le 2026-10-28).
 */
describe('PieceSheetHost — la fiche ouverte sur place', () => {
  function boot() {
    const navigations: unknown[] = [];
    const set: [string, number][] = [];
    TestBed.configureTestingModule({
      imports: [PieceSheetHost],
      providers: [
        provideRouter([]),
        // Aucun article connu : la fiche reste fermée, seul le routage compte ici.
        { provide: ShopCatalogue, useValue: { itemOf: () => null } },
        { provide: ClientCart, useValue: { quantityOf: () => 0 } },
        { provide: ProductAudience, useValue: { record: () => undefined } },
        {
          provide: PieceQuantity,
          useValue: { set: (id: string, quantity: number) => set.push([id, quantity]) > 0 },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = (commands: readonly unknown[]) => {
      navigations.push(commands);
      return Promise.resolve(true);
    };
    const fixture = TestBed.createComponent(PieceSheetHost);
    fixture.detectChanges();
    return { fixture, navigations, set, pieces: TestBed.inject(PieceRequest) };
  }

  it('ouvre la fiche demandée sans quitter la page', () => {
    const { fixture, navigations, pieces } = boot();

    pieces.open('SKU-1');
    fixture.detectChanges();

    expect(navigations).toEqual([]);
    // La demande est prise ICI : la boutique, si on y allait, n'aurait rien à rouvrir.
    expect(pieces.take()).toBeNull();
  });

  it('une fois la page quittée, la demande mène de nouveau à la boutique', () => {
    const { fixture, navigations, pieces } = boot();

    fixture.destroy();
    pieces.open('SKU-1');

    expect(navigations).toEqual([['/boutique']]);
  });
});
