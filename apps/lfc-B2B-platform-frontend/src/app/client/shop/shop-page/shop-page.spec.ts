import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop-catalogue.fixture';
import { ShopCatalogue } from '../shop-catalogue.store';
import { ClientCart } from '../../cart/client-cart.service';
import { OrderContextStore } from '../../../client/order-context.store';
import { FR } from '../../../client/copy/fr';
import { ShopPage } from './shop-page';

describe('ShopPage', () => {
  let fixture: ComponentFixture<ShopPage>;
  let cart: ClientCart;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const tiles = (): HTMLElement[] => Array.from(el().querySelectorAll('app-product-tile'));
  const chips = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('.chips button'));
  /**
   * Le champ vit désormais DANS `fold-search` : la boutique ne dessine plus sa
   * loupe, sa croix ni son compte. On vise le contrôle par son élément — pas
   * une classe de la lib, qui ne nous appartient pas.
   */
  const field = (): HTMLInputElement => {
    const input = el().querySelector('fold-search input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Le champ de recherche a disparu du rayon.');
    }
    return input;
  };

  const type = (text: string): void => {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ShopPage],
      providers: [provideRouter([]), provideHttpClient()],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(OrderContextStore).choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme, Val d’Isère',
      pickupAddressId: 'pick_labo',
      slot: '7 h – 8 h',
      date: '2026-09-07',
    });
    cart = TestBed.inject(ClientCart);
    cart.clear();
    fixture = TestBed.createComponent(ShopPage);
    fixture.detectChanges();
  });

  it('montre toutes les références du catalogue', () => {
    expect(tiles().length).toBe(TEST_ITEMS.length);
  });

  /**
   * Le rappel du service et le panier sont montés dans le BANDEAU, qui vit
   * dans le shell — un écran monté seul n'en a pas. Ce qui se vérifie ici,
   * c'est donc que la page ne les dessine plus elle-même : c'est
   * `CartBannerCard` qui les porte, et son propre spec les éprouve.
   */
  it('ne dessine plus le panier dans la page : il est au bandeau et en tiroir', () => {
    expect(el().querySelector('.basket')).toBeNull();
    expect(el().querySelector('app-order-context-bar')).toBeNull();
  });

  /**
   * 🔴 La barre du bas OUVRE LE TIROIR, elle ne change plus d'écran : on n'a
   * pas fini de choisir quand on vérifie ce qu'on a pris. Elle menait à
   * `/nouvelle-commande/panier`, ce qui faisait perdre le rayon — et le
   * défilement — pour relire trois lignes.
   *
   * ⚠️ L'ouverture elle-même ne s'observe pas ici : `client-dialog` appelle
   * `showModal()`, que jsdom n'implémente pas et que le composant saute
   * exprès (même garde qu'au rendu serveur). Ce qui se vérifie, c'est qu'on
   * reste sur la boutique.
   */
  it('la barre du bas ne quitte plus la boutique', () => {
    cart.add('VIE-001');
    fixture.detectChanges();
    const before = TestBed.inject(Router).url;

    el().querySelector<HTMLButtonElement>('app-cart-bar button')?.click();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe(before);
    expect(el().querySelector('app-cart-panel')).not.toBeNull();
  });

  it('un rayon filtre la vitrine sans toucher au reste', () => {
    // Le troisième bouton : « Tout », « Viennoiseries », puis « Pains ».
    chips()[2]?.click();
    fixture.detectChanges();

    // « Pains » : la campagne et la tradition.
    expect(tiles().length).toBe(2);
  });

  it('la recherche TRAVERSE les rayons — le client ne sait pas où c’est rangé', () => {
    type('pain');

    // Le pain de campagne et le pain aux céréales (rayon pains) ET le pain au
    // chocolat (rayon viennoiseries) : trois rayons, une seule question.
    const names = tiles().map((t) => t.textContent ?? '');
    expect(names.some((n) => n.includes('Pain de campagne'))).toBe(true);
    expect(names.some((n) => n.includes('Pain au chocolat'))).toBe(true);
  });

  it('chercher remet le filtre à zéro : les deux répondent à la même question', () => {
    chips()[2]?.click();
    fixture.detectChanges();
    type('eclair');

    expect(tiles().length).toBe(1);
    expect(el().textContent).toContain('Éclair');
  });

  /**
   * 🔴 **L'autre sens, et c'est lui qui a coûté une version de `fold-search`.**
   *
   * Choisir un rayon efface la recherche — sinon la boîte continuerait
   * d'afficher « eclair » au-dessus d'une grille qui montre tous les pains. Ça
   * n'était possible qu'en pilotant le champ de l'EXTÉRIEUR : une recherche qui
   * n'expose qu'un `output` ne peut pas être vidée, et c'est ce que le `model()`
   * de `value` a rendu possible (fold-ng 0.25.0).
   */
  it('choisir un rayon VIDE le champ, pas seulement le filtre', () => {
    type('eclair');
    expect(field().value).toBe('eclair');

    chips()[2]?.click();
    fixture.detectChanges();

    expect(field().value).toBe('');
    // Et la grille suit : « Pains », les deux, pas l'éclair.
    expect(tiles().length).toBe(2);
  });

  /** Le compte que la boutique annonce est celui de ce qu'elle montre. */
  it('annonce autant de pièces qu’elle en affiche', () => {
    const count = (): string => el().querySelector('fold-search p')?.textContent?.trim() ?? '';
    expect(count()).toBe(`${String(TEST_ITEMS.length)} ${FR.shop.piecesUnit}`);

    type('pain');

    expect(count()).toBe(`${String(tiles().length)} ${FR.shop.piecesUnit}`);
  });

  it('ignore les accents : « eclair » et « éclair » cherchent la même chose', () => {
    type('ECLAIR');
    expect(tiles().length).toBe(1);
  });

  it('sans résultat, l’écran dit quoi essayer plutôt que de rester vide', () => {
    type('foie gras');

    expect(tiles().length).toBe(0);
    expect(el().textContent).toContain(FR.shop.emptyTitle);
    expect(el().textContent).toContain(FR.shop.emptyHint);
  });

  it('la barre du panier n’apparaît qu’une fois quelque chose dedans', () => {
    expect(el().querySelector('app-cart-bar')).toBeNull();

    cart.add('VIE-001');
    fixture.detectChanges();

    expect(el().querySelector('app-cart-bar')).not.toBeNull();
  });
});
