import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ClientCart } from '../../client/client-cart.service';
import { ClientOrder } from '../../client/client-order.service';
import { FR } from '../../client/copy/fr';
import { RayonPage } from './rayon-page';

describe('RayonPage', () => {
  let fixture: ComponentFixture<RayonPage>;
  let cart: ClientCart;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const tiles = (): HTMLElement[] => Array.from(el().querySelectorAll('app-product-tile'));
  const chips = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('.chips button'));
  const field = (): HTMLInputElement => {
    const input = el().querySelector('.field input');
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
    TestBed.configureTestingModule({ imports: [RayonPage], providers: [provideRouter([])] });
    TestBed.inject(ClientOrder).choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme, Val d’Isère',
      discount: 10,
      fee: 0,
      slot: '7 h – 8 h',
    });
    cart = TestBed.inject(ClientCart);
    cart.clear();
    fixture = TestBed.createComponent(RayonPage);
    fixture.detectChanges();
  });

  it('montre les quatorze références, et le mode de service en permanence', () => {
    expect(tiles().length).toBe(14);
    expect(el().querySelector('.where')?.textContent).toContain('Le Labo · 7 h – 8 h');
  });

  it('un rayon filtre la vitrine sans toucher au reste', () => {
    // Le troisième bouton : « Tout », « Viennoiseries », puis « Pains ».
    chips()[2]?.click();
    fixture.detectChanges();

    // « Pains » : baguette, campagne, céréales.
    expect(tiles().length).toBe(3);
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

    cart.add('croissant');
    fixture.detectChanges();

    expect(el().querySelector('app-cart-bar')).not.toBeNull();
  });
});
