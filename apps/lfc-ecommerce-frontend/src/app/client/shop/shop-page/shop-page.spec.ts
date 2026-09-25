import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { matchMediaAt } from '../../mon-compte/account.fixture';

import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop-catalogue.fixture';
import { ShopCatalogue } from '../shop-catalogue.store';
import { ClientCart } from '../../cart/client-cart.service';
import { OrderContextStore } from '../../../client/order-context.store';
import { FR } from '../../../client/copy/fr';
import { COMMAND_TERMS_FR } from '../../copy/screens/command-terms.copy';
import { ClientChrome } from '../../client-chrome.service';
import { AuthFacade } from '../../../auth/auth.facade';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { NOEL, storefrontObject } from '../storefront/storefront.fixture';
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

    // Sans mode de service, `pay()` renvoie à l'accueil pour le demander : la
    // barre a donc bien déclenché le PARCOURS de règlement, pas un panneau.
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

      chips()[2]?.click();
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
  it('« Modifier » du pied, sans maison connue, retombe sur l’accueil', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    el().querySelector<HTMLButtonElement>('app-cart-bar .edit')?.click();

    expect(navigate).toHaveBeenCalledWith(['/bienvenue']);
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
            login: (target: string): void => {
              asked.push(`login:${target}`);
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
