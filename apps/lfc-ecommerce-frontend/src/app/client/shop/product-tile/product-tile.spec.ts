import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';

import { ClientCompany } from '../../client-company.service';

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
   * 🔴 **Le rayon d'un PARTICULIER est en TTC, et il le DIT** (D13,
   * 2026-09-21).
   *
   * Un prix alimentaire affiché sans mention se lit TTC en France ; la mention
   * est donc obligatoire dans les deux sens, et c'est elle qui empêche le même
   * nombre de vouloir dire deux choses.
   *
   * ⚠️ Ce cas exigeait l'inverse — « affiche le prix HORS TAXE » — et c'était
   * honnête sans être juste : un particulier ne récupère pas la taxe, et lui
   * demander d'ajouter 5,5 % de tête devant un rayon est une façon de ne pas
   * vendre. Le montant vient du SERVEUR (`unitPriceTtcCents`), passé par la
   * ventilation de la caisse : le dériver ici l'aurait fait diverger du panier
   * d'un centime.
   *
   * Sans société injectée, `ShopPriceBasis` lit « particulier » — la même
   * déduction que le serveur.
   */
  it('affiche le prix TTC à un particulier, mention comprise', () => {
    expect(priceText()).toBe('1,48 € TTC');
  });

  it('porte la mention dans la langue affichée', () => {
    expect(priceText().endsWith(FR.shop.ttcSuffix)).toBe(true);
  });

  /**
   * La mention QUALIFIE le montant, elle ne le double pas : elle vit dans son
   * propre élément pour porter un registre plus discret. Écrite du même corps,
   * elle pesait autant que le prix qu'on vient lire.
   */
  it('sépare la mention du montant, pour pouvoir la rendre discrète', () => {
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.price-ht')?.textContent?.trim()).toBe(FR.shop.ttcSuffix);
    // Le montant seul, sans la mention collée dedans.
    //
    // Lu par SOUSTRACTION plutôt qu'au premier nœud : depuis qu'un tarif
    // catalogue barré peut précéder le prix, `firstChild` n'est plus le
    // montant. Viser une position dans le DOM faisait dépendre ce cas de
    // l'ordre des fragments, alors qu'il n'éprouve que leur séparation.
    const price = el.querySelector('.price');
    const suffix = el.querySelector('.price-ht')?.textContent ?? '';
    expect((price?.textContent ?? '').replace(suffix, '').trim()).toBe('1,48 €');
  });

  /**
   * 🔴 **Un PROFESSIONNEL garde le hors taxe** — l'autre moitié de D13, et
   * celle qu'aucun test ne tenait.
   *
   * Un pro récupère la taxe, raisonne sa marge sur le hors taxe, et le retrouve
   * tel quel sur sa facture. Lui montrer un TTC lui demanderait de refaire le
   * calcul à chaque ligne.
   *
   * Sans ce cas, basculer toute la boutique en TTC passerait au vert : les
   * quatre cas d'à côté ne décrivent qu'un particulier, et c'est exactement le
   * genre de demi-couverture qui laisse une régression traverser.
   */
  it('🔴 garde le HORS TAXE pour un professionnel', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductTile],
      providers: [
        {
          provide: ClientCompany,
          useValue: { company: signal<Partial<CompanyView>>({ status: 'active' }) },
        },
      ],
    });
    const pro = TestBed.createComponent(ProductTile);
    pro.componentRef.setInput('product', TEST_ITEMS[0]);
    pro.detectChanges();

    const text =
      (pro.nativeElement as HTMLElement).querySelector('.price')?.textContent?.trim() ?? '';
    expect(text).toBe('1,40 € HT');
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
