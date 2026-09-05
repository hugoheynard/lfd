import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { ClientCart } from '../client-cart.service';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { CartSummary } from './cart-summary';

describe('CartSummary', () => {
  let fixture: ComponentFixture<CartSummary>;
  let cart: ClientCart;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CartSummary], providers: [provideHttpClient()] });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    cart = TestBed.inject(ClientCart);
    cart.clear();
    cart.add('VIE-001');
    cart.add('VIE-001');
    cart.add('VIE-002');
    fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
  });

  it('pose une ligne par référence, pas par pièce', () => {
    expect(el().querySelectorAll('.lines > li')).toHaveLength(2);
  });

  /**
   * 🔴 **La ligne est un `<li>`.** La liste est un `<ul>`, dont les seuls
   * enfants valides sont des `<li>` : un élément de composant intermédiaire
   * obligerait à un `display: contents`, qui retire l'élément de l'arbre
   * d'accessibilité chez certains lecteurs d'écran — la liste n'annoncerait
   * alors plus ses items. C'est pour ça que `CartProductLine` porte un
   * sélecteur d'attribut, et ce test est le seul endroit où ça se vérifie :
   * `TestBed` fabrique un hôte `div` quel que soit le sélecteur.
   */
  it('ne glisse aucun élément entre la liste et ses items', () => {
    const items = [...el().querySelectorAll('.lines > *')];

    // `every` sur un tableau vide rend `true` : sans ce compte, le test
    // passerait aussi bien si la liste ne contenait plus rien du tout.
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.tagName === 'LI')).toBe(true);
  });

  /**
   * Le décompte CÂBLE les gestes de la ligne : elle les remonte, il les
   * applique. C'est le partage habituel — la ligne ne connaît pas le panier.
   */
  it('applique le réglage de quantité venu d’une ligne', () => {
    // Le « + » du champ empilé, dans la PREMIÈRE ligne — pas dans la liste
    // entière, dont le dernier bouton appartiendrait à la seconde. `fold`
    // empile l'incrément AU-DESSUS du décrément, donc c'est le premier.
    const first = el().querySelector('.lines > li');
    const plus = first?.querySelectorAll<HTMLButtonElement>('fold-number-input button')[0];

    plus?.click();
    fixture.detectChanges();

    expect(cart.quantityOf('VIE-001')).toBe(3);
  });

  it('la corbeille d’une ligne retire la ligne, pas une pièce', () => {
    const bin = el().querySelector<HTMLButtonElement>('.drop');

    bin?.click();
    fixture.detectChanges();

    expect(cart.quantityOf('VIE-001')).toBe(0);
    expect(el().querySelectorAll('.lines > li')).toHaveLength(1);
  });

  /** Vider est une sortie : elle existe, et elle disparaît quand il n'y a rien. */
  it('offre de vider, et retire l’offre sur un panier vide', () => {
    el().querySelector<HTMLButtonElement>('.empty-out')?.click();
    fixture.detectChanges();

    expect(cart.isEmpty()).toBe(true);
    expect(el().querySelector('.empty-out')).toBeNull();
  });

  it('récapitule en HT et rend le total toutes taxes comprises', () => {
    const labels = [...el().querySelectorAll('.count dt')].map((dt) => dt.textContent?.trim());

    expect(labels[0]).toBe('Sous-total HT');
    expect(labels.at(-1)).toBe('Total TTC');
  });
});
