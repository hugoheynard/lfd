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

  /**
   * La maquette de la boutique pro a UNIFIÉ les deux densités : un seul bouton,
   * qui ajoute, et porte la quantité une fois l'article au panier. Plus de
   * stepper dans la vignette — le retrait se fait dans la fiche.
   */
  it('porte UN seul geste d’ajout, « + » à vide puis la quantité', () => {
    const el = fixture.nativeElement as HTMLElement;
    const added: number[] = [];
    fixture.componentInstance.added.subscribe(() => added.push(1));

    expect(el.querySelectorAll('.quick')).toHaveLength(1);
    expect(el.querySelector('app-quantity-rail')).toBeNull();
    expect(el.querySelector('.quick fold-icon')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('.quick')?.click();
    expect(added).toHaveLength(1);

    fixture.componentRef.setInput('quantity', 3);
    fixture.detectChanges();
    expect(el.querySelector('.quick')?.textContent?.trim()).toBe('3');
  });

  it('au niveau `browse`, ne propose aucun ajout', () => {
    fixture.componentRef.setInput('orderable', false);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.quick')).toBeNull();
  });

  /**
   * Le best-seller se distingue par sa pastille ; une pièce ordinaire n'en a
   * pas — aucun chiffre de vente n'est servi, aucun n'est affiché.
   */
  it('marque le best-seller, et lui seul, de sa pastille', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.badge')).toBeNull();

    const featured = { ...TEST_ITEMS[0], isFeatured: true, note: 'Tressée aux pralines' };
    fixture.componentRef.setInput('product', featured);
    fixture.detectChanges();

    expect(el.querySelector('.tile.featured')).not.toBeNull();
    expect(el.querySelector('.badge')?.textContent).toContain(FR.product.bestSeller);
    expect(el.querySelector('.note')?.textContent?.trim()).toBe(featured.note);
  });

  /**
   * Le texte court est sur TOUTES les cartes depuis le 2026-09-24 — il était
   * réservé au best-seller. Sans texte au référentiel, rien : pas de ligne vide.
   */
  it('porte le texte court sur une carte ordinaire, et rien quand il manque', () => {
    const el = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('product', { ...TEST_ITEMS[0], note: 'Pur beurre' });
    fixture.detectChanges();
    expect(el.querySelector('.note')?.textContent?.trim()).toBe('Pur beurre');

    fixture.componentRef.setInput('product', { ...TEST_ITEMS[0], note: null });
    fixture.detectChanges();
    expect(el.querySelector('.note')).toBeNull();
  });

  describe('sa forme de vitrine', () => {
    const tile = (): Element | null =>
      (fixture.nativeElement as HTMLElement).querySelector('.tile');
    const featuredItem = TEST_ITEMS.find((item) => item.isFeatured);

    it('hors vitrine, le best-seller est celui que le catalogue marque', () => {
      fixture.componentRef.setInput('product', featuredItem);
      fixture.detectChanges();

      expect(tile()?.classList.contains('featured')).toBe(true);
      expect(tile()?.classList.contains('side-left')).toBe(true);
    });

    /** Dans une grille composée, c'est la FORME qui fait le best-seller, plus `isFeatured`. */
    it('en carte 1×1, un article marqué reste une vignette, sans ton', () => {
      fixture.componentRef.setInput('product', featuredItem);
      fixture.componentRef.setInput('shape', 'card');
      fixture.componentRef.setInput('tone', 'dark');
      fixture.detectChanges();

      expect(tile()?.classList.contains('featured')).toBe(false);
      expect(tile()?.classList.contains('tone-dark')).toBe(false);
    });

    it('sur une forme plus grande, tout article prend la mise en page du best-seller', () => {
      fixture.componentRef.setInput('shape', 'block');
      fixture.componentRef.setInput('mediaSide', 'top');
      fixture.componentRef.setInput('tone', 'accent');
      fixture.componentRef.setInput('mediaFit', 'contain');
      fixture.detectChanges();

      const classes = tile()?.classList;
      expect(classes?.contains('featured')).toBe(true);
      expect(classes?.contains('side-top')).toBe(true);
      expect(classes?.contains('tall')).toBe(true);
      expect(classes?.contains('tone-accent')).toBe(true);
      expect(classes?.contains('contain')).toBe(true);
    });
  });
});
