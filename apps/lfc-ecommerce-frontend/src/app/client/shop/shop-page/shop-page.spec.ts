import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AUTH_CONFIG } from '../../../auth/auth.config';
import { ProVisit } from '../pro-visit.service';
import { NEVER } from 'rxjs';
import { FoldPanelHostService } from 'fold-ng';
import { vi } from 'vitest';

import { matchMediaAt } from '../../mon-compte/account.fixture';

import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop-catalogue.fixture';
import { ShopCatalogue } from '../shop-catalogue.store';
import { CartStore } from '../../cart/cart.store';
import { ClientCart } from '../../cart/client-cart.service';
import { SignInDialog } from '../../../login/sign-in-dialog/sign-in-dialog';
import { OrderContextStore } from '../../../client/order-context.store';
import { FR } from '../../../client/copy/fr';
import { COMMAND_TERMS_FR } from '../../copy/screens/command-terms.copy';
import { ClientChrome } from '../../client-chrome.service';
import { AuthFacade } from '../../../auth/auth.facade';
import { OrderDoors } from '../order-doors';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { NOEL, storefrontObject } from '../storefront/storefront.fixture';
import { ClientOrders } from '../../client-orders.service';
import { PieceRequest } from '../piece-request.service';
import { Shop } from '../shop.service';
import { FEATURED_SHELF } from '../shelves';
import { ShopPage } from './shop-page';

// `matchMedia` pour TOUS les cas du fichier : « Régler » ouvre le panier par
// `dialogSide()`, qui le lit au clic ; un cas qui ne le simulait pas laissait
// une erreur non gérée, qui fait sortir la suite en échec (CI de X2, 2026-10-17).
beforeEach(() => {
  vi.stubGlobal('matchMedia', matchMediaAt(false));
});

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
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Une personne reconnue (le contournement d'Auth0 des suites), en perso :
        // la vitrine se lit alors par `/mine`, dès que l'espace est connu.
        provideWorkspace(workspaceDouble()),
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(OrderContextStore).choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme, Val d’Isère',
      pickupAddressId: 'pick_labo',
      slot: '7 h – 8 h',
      window: { start: '07:00', end: '08:00' },
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

  it('ouvre la fiche qu’une suggestion demande, une seule fois', () => {
    const item = TEST_ITEMS[0];
    if (item === undefined) {
      throw new RangeError('la fixture du catalogue est vide');
    }
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const pieces = TestBed.inject(PieceRequest);

    pieces.open(item.sku);
    TestBed.tick();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/boutique']);
    expect(el().querySelector('app-product-sheet')?.textContent).toContain(item.name);
    expect(pieces.take()).toBeNull();
  });

  /**
   * Le rappel du service et le panier sont montés dans le BANDEAU, qui vit
   * dans le shell — un écran monté seul n'en a pas. Ce qui se vérifie ici,
   * c'est donc que la page ne les dessine plus elle-même.
   *
   * ⚠️ Cette note désignait `CartBannerCard` comme leur porteur et renvoyait à
   * son spec. Ce composant a été **supprimé le 2026-09-17** : le bandeau a
   * perdu sa carte, plus rien ne l'importait, et laisser la phrase aurait
   * envoyé chercher l'épreuve dans un fichier qui n'existe plus.
   */
  it('ne dessine plus le panier dans la page : il est au bandeau et en tiroir', () => {
    expect(el().querySelector('.basket')).toBeNull();
    expect(el().querySelector('app-order-context-bar')).toBeNull();
  });

  /**
   * 🔴 **LA BARRE DU BAS MÈNE AU RÈGLEMENT** (Hugo, 2026-09-21 : « celui du bas
   * doit emmener à règlement »).
   *
   * Elle a mené à la page panier, puis ouvert un tiroir. Ni l'un ni l'autre :
   * une barre collante au bas d'un rayon est la dernière chose qu'on lit avant
   * de payer. Relire son panier se fait désormais par la pastille de la barre
   * du HAUT — popover au bureau, panneau entier en pile.
   *
   * ⚠️ Ce qui est éprouvé ici est le GESTE demandé, pas son aboutissement :
   * `pay()` exige un mode de service et une identité, et ce cas n'en a pas. Il
   * vérifie donc qu'on part de la boutique — ce qu'un tiroir ne faisait pas.
   */
  it('🔴 la barre du bas emmène régler, elle n’ouvre plus de tiroir', () => {
    cart.add('VIE-001');
    fixture.detectChanges();

    expect(el().querySelector('app-cart-panel')).toBeNull();
    expect(el().querySelector('app-cart-bar .pay')?.textContent).toContain(COMMAND_TERMS_FR.pay);

    el().querySelector<HTMLButtonElement>('app-cart-bar .pay')?.click();
    fixture.detectChanges();

    // La barre a bien déclenché le PARCOURS de règlement, pas un panneau.
    expect(TestBed.inject(Router).url).not.toBe('/boutique');
  });

  describe('la vitrine du rayon', () => {
    const info = (): Element | null => el().querySelector('app-info-card');
    const storefront = (key: string) =>
      TestBed.inject(HttpTestingController).expectOne((request) =>
        request.url.endsWith(`/shop/storefront/${key}/mine`),
      );

    async function settle(): Promise<void> {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    /**
     * Chaque rayon a SA page — « Tout » sous la clé `all`. Pendant une
     * recherche, aucune : elle traverse les rayons.
     */
    it('compose chaque rayon avec sa page, et rien pendant une recherche', async () => {
      storefront('all').flush({ rows: 2, objects: [storefrontObject({ id: 'noel' })] });
      await settle();
      expect(info()).not.toBeNull();

      chips()[3]?.click();
      fixture.detectChanges();
      storefront('cat_pains').flush({ rows: 0, objects: [] });
      await settle();
      expect(info()).toBeNull();
      expect(tiles().length).toBe(2);

      chips()[0]?.click();
      await settle();
      expect(info()).not.toBeNull();

      type('pain');
      expect(info()).toBeNull();
    });

    /** 🔴 Une vitrine injoignable n'est pas un écran vide : le rayon, comme avant. */
    it('une vitrine en panne rend le rayon comme avant', async () => {
      storefront('all').flush('boum', { status: 503, statusText: 'Unavailable' });
      await settle();

      expect(el().querySelector('app-shelf-grid .board')).toBeNull();
      expect(tiles().length).toBe(TEST_ITEMS.length);
    });

    it('le rayon reste là pendant que sa page se charge', () => {
      storefront('all');
      expect(tiles().length).toBe(TEST_ITEMS.length);
    });

    /** « Ouvrir le rayon » d'une annonce filtre la vitrine comme une puce le ferait. */
    it('« Ouvrir le rayon » d’une annonce ouvre le rayon lié', async () => {
      storefront('all').flush({ rows: 1, objects: [storefrontObject({ id: 'noel' })] });
      await settle();

      el().querySelector<HTMLButtonElement>('app-info-card button')?.click();
      fixture.detectChanges();
      storefront(NOEL.linkShelfKey ?? '').flush({ rows: 0, objects: [] });
      await settle();

      expect(info()).toBeNull();
      expect(tiles().length).toBeLessThan(TEST_ITEMS.length);
    });
  });

  it('un rayon filtre la vitrine sans toucher au reste', () => {
    // Le quatrième bouton : « Tout », la mise en avant, « Viennoiseries », puis « Pains ».
    chips()[3]?.click();
    fixture.detectChanges();

    // « Pains » : la campagne et la tradition.
    expect(tiles().length).toBe(2);
  });

  describe('la mise en avant, en rayon', () => {
    it('vient juste après « Tout », sous le nom de la pastille, et ne montre que les mis en avant', () => {
      expect(chips()[1]?.textContent?.trim()).toBe(FR.product.bestSeller);

      chips()[1]?.click();
      fixture.detectChanges();

      const featured = TEST_ITEMS.filter((item) => item.isFeatured);
      expect(featured.length).toBeGreaterThan(0);
      expect(tiles().length).toBe(featured.length);
    });

    it('n’existe pas quand la vue lue ne met rien en avant', () => {
      hydrateWith(TestBed.inject(ShopCatalogue), {
        ...TEST_CATALOGUE,
        items: TEST_ITEMS.map((item) => ({ ...item, isFeatured: false })),
      });
      fixture.detectChanges();

      expect(chips().map((chip) => chip.textContent?.trim())).not.toContain(FR.product.bestSeller);
    });
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
    chips()[3]?.click();
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

    chips()[3]?.click();
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

  /**
   * 🔴 En PILE, le pied est là dès la boutique ouverte, panier vide compris
   * (plan lot 3) : il porte la commande. Il ne dépend plus de `!isEmpty()` —
   * au bureau, il n'est jamais montré (CSS) : la barre porte le règlement.
   */
  it('pose le pied panier vide, bouton inactif', () => {
    const foot = el().querySelector('app-cart-bar');
    expect(foot).not.toBeNull();
    expect(foot?.querySelector<HTMLButtonElement>('.pay')?.disabled).toBe(true);
    expect(foot?.textContent).toContain(COMMAND_TERMS_FR.emptyShort);
  });

  /**
   * « Modifier » rouvre l'heure sur la maison retenue (`changeTime()`) ; quand
   * la maison n'est pas connue des points chargés — le cas de ce harnais —,
   * il retombe sur l'accueil, où la question se pose entière.
   */
  /**
   * Régression (Hugo, 2026-10-11 : « quand je fais Régler dans la barre ça me
   * ramène sur bienvenue ») : sans maison connue, la page renvoyait à l'accueil
   * au lieu d'ouvrir les dialogues que le panier et l'accueil ouvrent sur place.
   */
  it('« Modifier » du pied rouvre l’heure de la maison prise, sans quitter le rayon', async () => {
    const time = vi.spyOn(TestBed.inject(OrderDoors), 'time').mockResolvedValue(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    el().querySelector<HTMLButtonElement>('app-cart-bar .edit')?.click();
    await fixture.whenStable();

    expect(time).toHaveBeenCalledWith('pick_labo', 'Le Labo', 'Route de la Balme, Val d’Isère');
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * Régression (Hugo, 2026-10-13, O6) : sans service, « Régler » ouvrait le
   * retrait d'office, et la livraison n'était jamais proposée. Il pose d'abord
   * la question « retrait ou coursier ? ».
   */
  it('« Régler » sans service pose « retrait ou coursier ? », et renoncer laisse sur le rayon', async () => {
    TestBed.inject(OrderContextStore).choice.set(null);
    const pickup = vi.spyOn(TestBed.inject(OrderDoors), 'choose').mockResolvedValue(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    cart.add('VIE-001');
    fixture.detectChanges();

    el().querySelector<HTMLButtonElement>('app-cart-bar .pay')?.click();
    await fixture.whenStable();

    expect(pickup).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  /** Le chevron est parti : le logo reprend le coin (Hugo, 2026-09-24). */
  it('ne pose plus de chevron de retour dans l’en-tête', () => {
    expect(TestBed.inject(ClientChrome).back()).toBeNull();
  });

  /**
   * 🔴 Au bureau, la barre « Ma commande » apparaît dès la PREMIÈRE pièce,
   * service choisi ou non (Hugo, 2026-09-24) ; le pied n'y est jamais montré —
   * c'est du CSS, que jsdom ne joue pas. Ce qui s'éprouve ici : la page réserve
   * la place de la barre dès qu'elle existe.
   */
  it('réserve la place de la barre dès la première pièce, sans service choisi', () => {
    TestBed.inject(OrderContextStore).choice.set(null);
    fixture.detectChanges();
    expect(el().querySelector('.shop')?.classList).not.toContain('under-bar');

    cart.add('VIE-001');
    fixture.detectChanges();
    expect(el().querySelector('.shop')?.classList).toContain('under-bar');
  });
});

/**
 * 🔴 **ON PEUT COMMANDER SANS COMPTE DEPUIS LA BARRE** (Hugo, 2026-09-21).
 *
 * Elle poussait vers Auth0 dès qu'on n'était pas connecté, au motif qu'« une
 * commande a un propriétaire ». Ce n'est plus vrai : `POST /shop/orders`
 * existe, et un visiteur repart avec sa commande.
 *
 * ⚠️ Elle n'ouvre pas pour autant la saisie d'invité : ce dialogue ne propose
 * QUE la saisie, et l'ouvrir en direct retirerait le second chemin — se
 * connecter — à qui a un compte et ne l'a pas dit. Le panier pose les deux
 * portes côte à côte, et c'est la seule surface qui porte cette question.
 */
describe('ShopPage — la barre du bas, sans compte', () => {
  let fixture: ComponentFixture<ShopPage>;
  let asked: string[];

  beforeEach(() => {
    localStorage.clear();
    asked = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ShopPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            isLoading: (): boolean => false,
            isAuthenticated: (): boolean => false,
            continueWithEmailCode: (target: string): void => {
              asked.push(`code:${target}`);
            },
          },
        },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(OrderContextStore).choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme, Val d’Isère',
      pickupAddressId: 'pick_labo',
      slot: '7 h – 8 h',
      window: { start: '07:00', end: '08:00' },
      date: '2026-09-07',
    });
    TestBed.inject(ClientCart).clear();
    TestBed.inject(ClientCart).add(TEST_ITEMS[0]?.sku ?? '');
    fixture = TestBed.createComponent(ShopPage);
    fixture.detectChanges();
  });

  /**
   * ⚠️ **Le panier se charge à la demande**, par un `import()` dynamique dans
   * `pay()`. Un `await Promise.resolve()` ne suffit pas à le laisser arriver :
   * le test finissait, Vitest démontait l'environnement, et le module se
   * résolvait dans le vide — `EnvironmentTeardownError`, comptée HORS du
   * décompte des tests. La suite affichait donc « tout vert » et sortait en
   * **1**, ce qui a bloqué un déploiement (relevé le 2026-09-22,
   * `todo-releve-version-deployee.md` §4).
   *
   * On le précharge : l'`import()` du composant retombe alors sur le cache de
   * modules et se résout tout de suite, sans rien laisser en vol.
   */
  it('🔴 ne pousse PLUS vers Auth0 quand personne n’est connecté', async () => {
    // Le panier s'ouvre en dialogue, et `dialogSide()` lit `matchMedia` pour
    // choisir son côté : sans lui, l'ouverture rejette. L'erreur restait
    // INVISIBLE tant que le module n'arrivait même pas.
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    await import('../../cart/cart-dialog/cart-dialog');
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('app-cart-bar .pay')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(asked).toEqual([]);
  });
});

/**
 * Régression (Hugo, 2026-10-13) : « quand je fais Régler ça m'amène
 * directement à la confirmation de commande sans passer par la page récap de
 * panier avec le choix au compte / carte en pro ». Connecté, la barre passait
 * la commande elle-même.
 */
describe('ShopPage — Régler, connecté', () => {
  it('🔴 ouvre le récapitulatif du panier au lieu de passer la commande', async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ShopPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            isLoading: (): boolean => false,
            isAuthenticated: (): boolean => true,
            authEmail: (): string | null => null,
            // `/me` reste en vol : la barre n'a pas besoin du compte pour régler.
            accessToken$: () => NEVER,
            continueWithEmailCode: (): void => undefined,
          },
        },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(OrderContextStore).choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme, Val d’Isère',
      pickupAddressId: 'pick_labo',
      slot: '7 h – 8 h',
      window: { start: '07:00', end: '08:00' },
      date: '2026-09-07',
    });
    TestBed.inject(ClientCart).clear();
    TestBed.inject(ClientCart).add(TEST_ITEMS[0]?.sku ?? '');
    const place = vi.spyOn(TestBed.inject(ClientOrders), 'place');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const { CartDialog } = await import('../../cart/cart-dialog/cart-dialog');
    const opened = vi.spyOn(CartDialog, 'open');
    const fixture = TestBed.createComponent(ShopPage);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('app-cart-bar .pay')
      ?.click();
    await vi.waitFor(() => {
      expect(opened).toHaveBeenCalled();
    });
    expect(place).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

/**
 * La visite pro (Hugo, 2026-10-19) : `/boutique#pro`, depuis la landing `/pro`,
 * met un visiteur en tarifs pro hors taxe, avec son repère ; sans `#pro`, rien
 * ne change.
 */
describe('ShopPage — la visite pro par #pro', () => {
  let harness: RouterTestingHarness;

  async function arrive(url: string, before: () => void = () => undefined): Promise<HTMLElement> {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'boutique', component: ShopPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
        },
        provideWorkspace(workspaceDouble()),
      ],
    });
    before();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, ShopPage);
    const http = TestBed.inject(HttpTestingController);
    // Deux passes : la requête de la vitrine peut ne partir qu’au second tour.
    for (let pass = 0; pass < 2; pass += 1) {
      http
        .match((r) => r.url === `${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`)
        .forEach((r) => r.flush(TEST_CATALOGUE));
      await harness.fixture.whenStable();
    }
    harness.detectChanges();
    return harness.routeNativeElement ?? document.createElement('div');
  }

  it('un visiteur arrivé par #pro lit le hors taxe et le repère', async () => {
    const page = await arrive('/boutique#pro');

    expect(TestBed.inject(ProVisit).active()).toBe(true);
    expect(page.textContent).toContain(FR.shop.proVisitNote);
    expect(page.querySelector('app-product-tile')?.textContent).toContain(FR.shop.htSuffix);
  });

  it('un visiteur sans #pro garde le TTC, sans repère', async () => {
    const page = await arrive('/boutique');

    expect(page.textContent).not.toContain(FR.shop.proVisitNote);
    expect(page.querySelector('app-product-tile')?.textContent).toContain(FR.shop.ttcSuffix);
  });

  /**
   * Régression (Hugo, 2026-10-19) : revenu sur `/boutique` sans `#pro` après
   * une visite pro, la boutique restait en hors taxe — le choix vivait en
   * `sessionStorage`, et rien à l'écran ne disait pourquoi.
   */
  it('revenu sur /boutique sans #pro après une visite pro, la boutique est en TTC', async () => {
    await arrive('/boutique#pro');
    await harness.navigateByUrl('/boutique', ShopPage);
    // La vitrine se relit à la source publique : on la sert.
    const http = TestBed.inject(HttpTestingController);
    for (let pass = 0; pass < 2; pass += 1) {
      http
        .match((r) => r.url === `${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`)
        .forEach((r) => r.flush(TEST_CATALOGUE));
      await harness.fixture.whenStable();
    }
    harness.detectChanges();
    const page = harness.routeNativeElement ?? document.createElement('div');

    expect(TestBed.inject(ProVisit).active()).toBe(false);
    expect(page.textContent).not.toContain(FR.shop.proVisitNote);
    expect(page.querySelector('app-product-tile')?.textContent).toContain(FR.shop.ttcSuffix);
  });

  it('changer de rayon garde #pro dans l’adresse, et la visite', async () => {
    await arrive('/boutique#pro');
    harness.routeDebugElement?.injector.get(Shop).browse('cat_pains');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/boutique?rayon=cat_pains#pro');
    expect(TestBed.inject(ProVisit).active()).toBe(true);
  });

  it('`?rayon=` rouvre la mise en avant, et `#pro` cohabite avec elle', async () => {
    const page = await arrive(`/boutique?rayon=${FEATURED_SHELF}#pro`);

    expect(TestBed.inject(Router).url).toBe(`/boutique?rayon=${FEATURED_SHELF}#pro`);
    expect(TestBed.inject(ProVisit).active()).toBe(true);
    expect(page.querySelectorAll('app-product-tile').length).toBe(
      TEST_ITEMS.filter((item) => item.isFeatured).length,
    );
  });

  it('choisir la mise en avant l’écrit dans l’adresse, #pro gardé', async () => {
    await arrive('/boutique#pro');
    harness.routeDebugElement?.injector.get(Shop).browse(FEATURED_SHELF);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(`/boutique?rayon=${FEATURED_SHELF}#pro`);
  });

  it('ouvrir une fiche garde #pro dans l’adresse, et la visite', async () => {
    await arrive('/boutique#pro');
    TestBed.inject(PieceRequest).open(TEST_ITEMS[0]?.sku ?? '');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/boutique#pro');
    expect(TestBed.inject(ProVisit).active()).toBe(true);
  });

  it('« Voir les prix TTC » retire #pro de l’adresse', async () => {
    const page = await arrive('/boutique#pro');
    Array.from(page.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === FR.shop.proVisitShowTtc)
      ?.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/boutique');
    expect(TestBed.inject(ProVisit).active()).toBe(false);
  });

  /**
   * « Un pro non loggé ne doit pas pouvoir commander » (Hugo, 2026-10-19) : en
   * visite pro, le panier d'avant est caché — pas vidé —, le « + » ouvre la
   * connexion, et tout revient en sortant de la visite.
   */
  describe('on n’y commande pas', () => {
    const SKU = TEST_ITEMS[0]?.sku ?? '';

    let opened: unknown[];

    function fillCart(): void {
      opened = [];
      TestBed.overrideProvider(FoldPanelHostService, {
        useValue: {
          open: (component: unknown, options: { data?: unknown }): { close: () => void } => {
            opened.push({ component, data: options.data });
            return { close: (): void => undefined };
          },
        },
      });
      hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
      TestBed.inject(CartStore).setQuantity(SKU, 2);
    }

    it('cache le panier d’avant, et le « + » ouvre la connexion sans rien ajouter', async () => {
      const page = await arrive('/boutique#pro', fillCart);

      expect(TestBed.inject(ClientChrome).cart()).toBe(false);
      expect(page.querySelector('app-cart-bar')).toBeNull();
      expect(page.querySelector('app-order-bar')).toBeNull();
      expect(TestBed.inject(ClientCart).count()).toBe(0);

      page.querySelector<HTMLButtonElement>('app-product-tile .quick')?.click();

      expect(opened).toEqual([
        { component: SignInDialog, data: { target: '/mon-compte', email: '' } },
      ]);
      expect(TestBed.inject(CartStore).quantityOf(SKU)).toBe(2);
    });

    it('« Voir les prix TTC » rend le panier et son contenu', async () => {
      const page = await arrive('/boutique#pro', fillCart);
      const showTtc = Array.from(page.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === FR.shop.proVisitShowTtc,
      );
      showTtc?.click();
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(TestBed.inject(ClientChrome).cart()).toBe(true);
      expect(TestBed.inject(ClientCart).quantityOf(SKU)).toBe(2);
      expect(page.querySelector('app-cart-bar')).not.toBeNull();
    });

    it('hors visite pro, le panier reste dans la barre', async () => {
      await arrive('/boutique', fillCart);

      expect(TestBed.inject(ClientChrome).cart()).toBe(true);
    });
  });
});
