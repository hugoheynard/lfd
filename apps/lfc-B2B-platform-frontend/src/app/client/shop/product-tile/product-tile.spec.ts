import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import { TEST_ITEMS } from '../shop-catalogue.fixture';
import { ProductTile } from './product-tile';

describe('ProductTile', () => {
  let fixture: ComponentFixture<ProductTile>;

  const priceText = (): string =>
    (fixture.nativeElement as HTMLElement).querySelector('.price')?.textContent?.trim() ?? '';

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductTile] });
    fixture = TestBed.createComponent(ProductTile);
    // 1,40 € HT à 5,5 % — le premier article de la vitrine de test.
    fixture.componentRef.setInput('product', TEST_ITEMS[0]);
    fixture.detectChanges();
  });

  /**
   * 🔴 **Le prix du rayon est hors taxe, et il le DIT.**
   *
   * Un prix alimentaire affiché sans mention se lit TTC en France. La vignette
   * a longtemps montré du TTC converti dans le front ; elle montre désormais le
   * hors taxe que le référentiel sert, et la mention est ce qui empêche le même
   * nombre de vouloir dire deux choses.
   */
  it('affiche le prix HORS TAXE, mention comprise', () => {
    expect(priceText()).toBe('1,40 € HT');
  });

  /** Le TTC (1,48 €) ne s'affiche plus ici : ce n'est pas l'unité du rayon. */
  it('n’affiche pas le prix toutes taxes comprises', () => {
    expect(priceText()).not.toContain('1,48');
  });

  it('porte la mention dans la langue affichée', () => {
    expect(priceText().endsWith(FR.shop.htSuffix)).toBe(true);
  });

  /**
   * La mention QUALIFIE le montant, elle ne le double pas : elle vit dans son
   * propre élément pour porter un registre plus discret. Écrite du même corps,
   * elle pesait autant que le prix qu'on vient lire.
   */
  it('sépare la mention du montant, pour pouvoir la rendre discrète', () => {
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.price-ht')?.textContent?.trim()).toBe(FR.shop.htSuffix);
    // Le montant seul, sans la mention collée dedans.
    //
    // Lu par SOUSTRACTION plutôt qu'au premier nœud : depuis qu'un tarif
    // catalogue barré peut précéder le prix, `firstChild` n'est plus le
    // montant. Viser une position dans le DOM faisait dépendre ce cas de
    // l'ordre des fragments, alors qu'il n'éprouve que leur séparation.
    const price = el.querySelector('.price');
    const suffix = el.querySelector('.price-ht')?.textContent ?? '';
    expect((price?.textContent ?? '').replace(suffix, '').trim()).toBe('1,40 €');
  });

  /**
   * 🔴 **Rien n'est barré tant qu'il n'y a rien à barrer.**
   *
   * Le serveur ne remplit `catalogPriceMillicents` que sur les articles où le
   * prix servi diffère du tarif — c'est-à-dire sur ceux qu'un client a
   * négociés. Une rature qui apparaîtrait partout ne dirait plus rien, et la
   * tuile ne doit pas en inventer une à partir d'un champ absent.
   */
  it('ne barre RIEN sur un article que le client paie au tarif', () => {
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.price-was')).toBeNull();
  });
});
