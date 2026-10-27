import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';

import { ClientCompany } from '../../client-company.service';

import { FR } from '../../copy/fr';
import {
  hydrateWith,
  operationCatalogue,
  TEST_ITEMS,
  testOperationItem,
} from '../shop-catalogue.fixture';
import { ShopCatalogue } from '../shop-catalogue.store';
import type { ShopItemView, ShopOperationState } from '@lfd/contracts';
import { provideHttpClient } from '@angular/common/http';
import { ShopAllergenDisplay } from '../storefront/allergen-display.service';
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
    expect(el.querySelector('.price .sr-only')).toBeNull();
  });

  /** RGAA 3.1 (lot A5) : la rature ne s'entend pas, une phrase la dit. */
  it('dit l’ancien et le nouveau prix au lecteur d’écran, et cache le doublon', () => {
    fixture.componentRef.setInput('product', {
      ...TEST_ITEMS[0],
      catalogPriceMillicents: 155_560,
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.price .sr-only')?.textContent?.trim()).toBe(
      'Ancien prix : 1,56 €, nouveau prix : 1,48 € TTC',
    );
    expect(el.querySelector('.price-was')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.price-ht')?.getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * Le « + » NE BOUGE JAMAIS (Hugo, 2026-10-11) : il devenait le chiffre, et le
   * doigt qui revenait ajouter tombait sur un compteur. Une fois l'article
   * pris, un « − » paraît à sa gauche, et la quantité se pose sur la photo.
   */
  it('garde le « + » en place, ajoute un « − » et une pastille de quantité', () => {
    const el = fixture.nativeElement as HTMLElement;
    const gestures: string[] = [];
    fixture.componentInstance.added.subscribe(() => gestures.push('+'));
    fixture.componentInstance.removed.subscribe(() => gestures.push('-'));

    expect(el.querySelectorAll('.quick')).toHaveLength(1);
    expect(el.querySelector('.quick.less')).toBeNull();
    expect(el.querySelector('.count')).toBeNull();

    fixture.componentRef.setInput('quantity', 3);
    fixture.detectChanges();

    const [less, more] = [...el.querySelectorAll<HTMLButtonElement>('.quick')];
    expect(less?.classList).toContain('less');
    expect(more?.querySelector('fold-icon')).not.toBeNull();
    expect(more?.textContent?.trim()).toBe('');
    expect(el.querySelector('.media .count')?.textContent?.trim()).toBe('3');

    more?.click();
    less?.click();
    expect(gestures).toEqual(['+', '-']);
  });

  /**
   * 🔴 **Un seul arrêt de tabulation par produit** (RGAA 12.8, lot A2) : la
   * photo, le texte et le « + » en faisaient trois, quatre avec le « − », et un
   * rayon de vingt pièces en demandait soixante. Le nom, titre `h3` de la tuile
   * (RGAA 9.1), est le seul contrôle atteint ; il ouvre la fiche, où se règle
   * la quantité.
   */
  it('n’offre qu’un arrêt de tabulation : le nom, titre de la tuile, qui ouvre la fiche', () => {
    const el = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('quantity', 2);
    fixture.detectChanges();
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe(() => opened.push('fiche'));

    const stops = [...el.querySelectorAll<HTMLElement>('button, a[href], [tabindex]')].filter(
      (node) => node.tabIndex >= 0,
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]?.closest('h3')).not.toBeNull();
    expect(stops[0]?.textContent?.trim()).toBe(TEST_ITEMS[0]?.name);

    stops[0]?.click();
    expect(opened).toEqual(['fiche']);
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
   * « Les incontournables » (Hugo, 2026-10-18) : la pastille dit
   * « Incontournable » par défaut, plus « Best-seller ». Le texte reste
   * redéfinissable dans Textes de la boutique (clé `product.bestSeller`).
   */
  it('dit « Incontournable » sur la pastille par défaut', () => {
    const el = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('product', { ...TEST_ITEMS[0], isFeatured: true });
    fixture.detectChanges();

    expect(el.querySelector('.badge')?.textContent).toContain('Incontournable');
    expect(el.querySelector('.badge')?.textContent).not.toContain('Best-seller');
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

  /** La limite propre de l'article, en court sur la vignette (Hugo, 2026-10-21). */
  it('dit « Sur commande · 2 jours avant 12 h » quand l’article porte sa limite', () => {
    const el = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('product', {
      ...TEST_ITEMS[0],
      orderTimeLimit: { daysBefore: 2, time: '12:00' },
    });
    fixture.detectChanges();

    expect(el.querySelector('[data-made-to-order]')?.textContent?.trim()).toBe(
      'Sur commande · 2 jours avant 12\u00a0h',
    );
  });

  it('ne dit rien quand l’article suit la règle générale', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-made-to-order]')).toBeNull();
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

  /**
   * D8 : l'état d'un article réservé à une opération prend la place du « + ».
   * L'ajouter avant l'ouverture ferait un panier que la caisse refuse.
   */
  describe('un article réservé à une opération', () => {
    const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

    function mountOperation(state: ShopOperationState): void {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [ProductTile], providers: [provideHttpClient()] });
      hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue(state));
      fixture = TestBed.createComponent(ProductTile);
      fixture.componentRef.setInput('product', testOperationItem(state));
      fixture.detectChanges();
    }

    it('annoncée : « Ouvre le 15 nov. », à l’heure de Paris, et pas de « + »', () => {
      mountOperation('announced');

      expect(el().querySelector('fold-badge')?.textContent?.trim()).toBe('Ouvre le 15 nov.');
      expect(el().querySelector('.quick')).toBeNull();
    });

    it('close : « Commandes closes », et pas de « + »', () => {
      mountOperation('closed');

      expect(el().querySelector('fold-badge')?.textContent?.trim()).toBe(FR.shop.operationClosed);
      expect(el().querySelector('.quick')).toBeNull();
    });

    it('ouverte : le « + » comme n’importe quel article', () => {
      mountOperation('open');

      expect(el().querySelector('fold-badge')).toBeNull();
      expect(el().querySelector('.quick')).not.toBeNull();
    });

    it('un article courant n’a ni pastille ni changement', () => {
      expect(el().querySelector('fold-badge')).toBeNull();
      expect(el().querySelector('.quick')).not.toBeNull();
    });
  });

  /** L4 (2026-10-10) : la tuile recadre autour du point focal de la vignette. */
  it('pose object-position depuis le point focal, et le centre sans lui', () => {
    const img = (): HTMLImageElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('img');
    const photo = { url: 'https://media.example/c.jpg', alt: 'Croissant', width: 800, height: 600 };

    fixture.componentRef.setInput('product', {
      ...TEST_ITEMS[0],
      thumbnail: { ...photo, focal: { x: 0.2, y: 0.7 } },
    });
    fixture.detectChanges();
    expect(img()?.style.objectPosition).toBe('20% 70%');

    fixture.componentRef.setInput('product', { ...TEST_ITEMS[0], thumbnail: photo });
    fixture.detectChanges();
    expect(img()?.style.objectPosition).toBe('50% 50%');
  });
});

/** Les allergènes en carte (Hugo, 2026-10-27) : seulement quand la vitrine le règle. */
describe('ProductTile — les allergènes en galerie', () => {
  const ALLERGIC: ShopItemView = {
    ...(TEST_ITEMS[0] as ShopItemView),
    allergens: { state: 'declared', contains: ['Gluten', 'Lait'], mayContain: ['Sésame'] },
  };

  function mount(display: 'sheet' | 'gallery'): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductTile] });
    TestBed.inject(ShopAllergenDisplay).served(display);
    const tile = TestBed.createComponent(ProductTile);
    tile.componentRef.setInput('product', ALLERGIC);
    tile.detectChanges();
    return tile.nativeElement as HTMLElement;
  }

  it('ne dit rien des allergènes par défaut — la fiche les donne', () => {
    expect(mount('sheet').querySelector('[data-allergens]')).toBeNull();
  });

  it('dit les allergènes puis les traces, en texte, quand la vitrine les montre en galerie', () => {
    expect(mount('gallery').querySelector('[data-allergens]')?.textContent?.trim()).toBe(
      'Contient : Gluten, Lait · Peut contenir : Sésame',
    );
  });
});
