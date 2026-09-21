import { provideHttpClient } from '@angular/common/http';
import { Component, effect, inject, viewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

import { ClientBanner } from '../../../client/nav/client-banner';

import { ClientChrome } from '../../../client/client-chrome.service';
import { ClientLocale } from '../../../client/client-locale.service';
import { fill } from '../../../client/copy/client-copy.service';
import { FR } from '../../../client/copy/fr';
import { IT } from '../../../client/copy/it';
import { ClientIdentity } from '../../../client/client-identity.service';
import { ServicePoints } from '../../../client/shop/pickup-points.store';
import type { PickupAddressView } from '@lfd/contracts';

import { CommandePage } from './commande-page';
import { PickupDialog } from './pickup-dialog/pickup-dialog';
import type { ServiceChoice } from '../../../client/order-context.store';

/**
 * Le compte RECONNU de la suite.
 *
 * 🔴 Ces valeurs venaient d'une maquette partagée avec l'écran — « Pierre », son
 * téléphone. Un test vert ne prouvait alors que la cohérence de la maquette avec
 * elle-même ; ici la suite POSE le profil, comme le shell le fait.
 */
const PROFILE = {
  userId: 'usr_1',
  firstName: 'Camille',
  lastName: 'Vallet',
  email: 'camille@lestommeuses.fr',
  phone: '06 11 22 33 44',
};

/**
 * Deux points, dont UN seul remis — à 20 %, et pas au 10 % que la copie portait.
 */
const POINT = (over: Partial<PickupAddressView>): PickupAddressView => ({
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  isDefault: true,
  discount: { mode: 'percent', bp: 2_000 },
  discountAudiences: { b2b: true, b2c: true },
  opening: { proPickup: null, publicOpening: null },
  ...over,
});

const POINTS: readonly PickupAddressView[] = [
  POINT({}),
  POINT({ id: 'pick_village', label: 'Le Village', isDefault: false, discount: null }),
];

/**
 * Le shell fournit au bandeau l'endroit où atterrir. Sans lui, le gabarit que
 * l'écran déclare ne se rend NULLE PART — c'est le comportement voulu, mais il
 * faut le reproduire ici pour vérifier ce que l'écran y met.
 */
@Component({ standalone: true, template: '<ng-container #slot />' })
class BannerSlotHost {
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });

  constructor() {
    const banner = inject(ClientBanner);
    effect(() => banner.slot.set(this.slot()));
  }
}

/**
 * L'écran est piloté par le DOM : ses membres sont `protected`, et ce qui compte
 * est ce que voit la personne qui l'utilise.
 */
describe('CommandePage', () => {
  let fixture: ComponentFixture<CommandePage>;
  let banner: HTMLElement;
  let chrome: ClientChrome;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return found;
  };

  const click = (label: string): void => {
    button(label).click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommandePage],
      providers: [provideHttpClient(), provideRouter([])],
    });
    TestBed.inject(ServicePoints).receive(POINTS, []);
    const slot = TestBed.createComponent(BannerSlotHost);
    slot.detectChanges();
    banner = slot.nativeElement as HTMLElement;
    fixture = TestBed.createComponent(CommandePage);
    chrome = TestBed.inject(ClientChrome);
    TestBed.inject(ClientIdentity).apply(PROFILE);
    fixture.detectChanges();
  });

  it('accueille par son prénom, et pose une seule question', () => {
    // Le salut n'est plus dans l'écran : il est dans la DESCENTE, que le shell
    // place au-dessus de la sous-barre. L'écran ne fait que l'y publier.
    fixture.detectChanges();
    expect(banner.textContent ?? '').toContain(
      fill(FR.commande.title, { name: PROFILE.firstName }),
    );
    expect(chrome.kicker()).toBe(FR.chrome.kickerCommande);
    expect(chrome.back()).toBeNull();
  });

  it('nomme chaque mode DEUX FOIS — le fournil, puis le client', () => {
    // C'est l'invariant de la carte : la pastille porte le mot du bon de
    // commande, le titre celui du client. Perdre l'un des deux la vide.
    const pickup = el().querySelector('app-offer-card[data-photo="labo"]');
    expect(pickup?.textContent).toContain(FR.commande.pickupBadge);
    expect(pickup?.textContent).toContain('Je passe');

    const delivery = el().querySelector('app-offer-card[data-tone="butter"]');
    expect(delivery?.textContent).toContain(FR.commande.deliveryBadge);
    expect(delivery?.textContent).toContain('l’apporte');
  });

  /**
   * Régression : la carte annonçait « Jusqu’à −10 % », écrit dans la copie,
   * quand le back-office remettait 20 % — et le dialogue, lui, disait 20 %.
   */
  it('la carte du retrait annonce la remise du back-office, pas un chiffre de copie', () => {
    const pickup = el().querySelector('app-offer-card[data-photo="labo"]');
    expect(pickup?.textContent).toContain(fill(FR.commande.pickupNoteWide, { value: '20 %' }));
    expect(pickup?.textContent).not.toContain('10 %');
  });

  it("sans remise publiée, la carte n'invente aucun chiffre", () => {
    TestBed.inject(ServicePoints).receive(
      POINTS.map((p) => ({ ...p, discount: null })),
      [],
    );
    fixture.detectChanges();
    const pickup = el().querySelector('app-offer-card[data-photo="labo"]');
    expect(pickup?.textContent).not.toContain('%');
  });

  /** Plan remise et livraison par clientèle, D4 et D7 : fermer la livraison est un réglage. */
  it('sans livraison ouverte à la clientèle, la carte « On vous l’apporte » ne paraît pas', () => {
    TestBed.inject(ServicePoints).receive(POINTS, [], [], { openToB2b: false, openToB2c: false });
    fixture.detectChanges();

    expect(
      el().querySelector('app-offer-card[data-photo="coursier"][data-shape="hero"]'),
    ).toBeNull();
    // Le retrait reste, seul dans sa section.
    const well = el().querySelector('app-section-panel[data-tone="well"]');
    expect(well?.querySelectorAll('app-offer-card')).toHaveLength(1);
  });

  it('retrait seul : une carte par boutique, qui ouvre le dialogue sur SON heure', () => {
    TestBed.inject(ServicePoints).receive(POINTS, [], [], { openToB2b: false, openToB2c: false });
    fixture.detectChanges();

    const shops = el().querySelectorAll(
      'app-section-panel[data-tone="well"] app-pickup-point-card',
    );
    expect(shops).toHaveLength(2);
    expect(shops[1]?.textContent).toContain('Le Village');
    // Les boutiques répondent à « où » : la carte du retrait ne le redemande
    // pas, et ne promet plus « demain à partir de 6 h ».
    const pickup = el().querySelector('app-offer-card[data-photo="labo"]');
    expect(pickup?.textContent).not.toContain(FR.commande.pickupCta);
    expect(pickup?.textContent).not.toContain(FR.commande.pickupNote);

    (shops[1]?.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialog = fixture.debugElement.query(By.directive(PickupDialog))
      .nativeElement as HTMLElement;
    expect(dialog.querySelector('h2.title')?.textContent).toBe(FR.pickupDialog.whenTitle);
    expect(dialog.querySelector('app-slot-step')?.textContent).toContain('Le Village');
  });

  it('« Je passe la prendre » ouvre toujours sur le lieu, même après une boutique', () => {
    TestBed.inject(ServicePoints).receive(POINTS, [], [], { openToB2b: false, openToB2c: false });
    fixture.detectChanges();
    (el().querySelector('app-pickup-point-card button') as HTMLButtonElement).click();
    fixture.detectChanges();

    (el().querySelector('app-offer-card[data-photo="labo"] button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialog = fixture.debugElement.query(By.directive(PickupDialog))
      .nativeElement as HTMLElement;
    expect(dialog.querySelector('h2.title')?.textContent).toBe(FR.pickupDialog.title);
  });

  it('en perso, les cartes de boutique ne disent pas « votre habitude »', () => {
    // La suite n'a pas de `/me` : la clientèle montrée est B2C.
    TestBed.inject(ServicePoints).receive(POINTS, [], [], { openToB2b: false, openToB2c: false });
    fixture.detectChanges();

    const shops = el().querySelector('.shops');
    expect(shops?.querySelectorAll('app-pickup-point-card')).toHaveLength(2);
    expect(shops?.textContent).not.toContain(FR.pickupDialog.habit);
  });

  it('livraison proposée : aucune carte de boutique', () => {
    expect(el().querySelector('app-pickup-point-card')).toBeNull();
  });

  it('une remise réservée aux pros ne s’annonce pas sur la carte d’un particulier', () => {
    // La suite n'a pas de `/me` : la clientèle montrée est B2C.
    TestBed.inject(ServicePoints).receive(
      POINTS.map((p) => ({ ...p, discountAudiences: { b2b: true, b2c: false } })),
      [],
    );
    fixture.detectChanges();
    const pickup = el().querySelector('app-offer-card[data-photo="labo"]');
    expect(pickup?.textContent).not.toContain('20 %');
  });

  it('range les offres en DEUX sections, au même gabarit', () => {
    // L'opération datée n'est pas une bannière sous les modes de service : elle
    // est une section du même carrousel, avec des cartes de même taille. C'est
    // ce qui lui donne le droit d'ouvrir une commande.
    const panels = el().querySelectorAll('app-section-panel');
    expect(panels.length).toBe(2);
    expect(panels[0]?.getAttribute('data-tone')).toBe('well');
    expect(panels[0]?.textContent).toContain(FR.commande.newOrderTitle);
    expect(panels[1]?.getAttribute('data-tone')).toBe('band');
    expect(panels[1]?.textContent).toContain(FR.commande.eventBadge);

    expect(el().querySelectorAll('app-offer-card').length).toBe(4);
  });

  it('donne un point par section, le premier actif', () => {
    const dots = Array.from(el().querySelectorAll('button.dot'));
    expect(dots.length).toBe(2);
    expect(dots[0]?.getAttribute('aria-selected')).toBe('true');
    expect(dots[0]?.getAttribute('aria-label')).toBe(FR.commande.newOrderTitle);
    expect(dots[1]?.getAttribute('aria-label')).toBe(FR.commande.nowTitle);
  });

  it('demande au chrome le menu et la cloche, pas la pastille de marque', () => {
    // La barre appartient au shell, mais c'est l'ÉCRAN qui dit ce qu'elle porte :
    // à qui est reconnu, un menu et ses non-lues plutôt que la marque.
    expect(chrome.menu()).toBe(true);
    expect(chrome.bell()).not.toBeNull();
    // 🔴 La cloche annonçait « 5 non lues », une constante : aucune notification
    // client n'existe côté serveur. Elle est là, muette, et c'est exact.
    expect(chrome.bellCount()).toBe(0);
  });

  it('une porte sans écran le DIT, au lieu de ne rien faire', () => {
    expect(text()).not.toContain(FR.commande.pending);

    click(FR.commande.againAction);

    expect(text()).toContain(FR.commande.pending);
  });

  it('« je visite la boutique » mène au rayon, sans rien demander avant', () => {
    // Regarder d'abord, décider ensuite : c'est ce que la ligne promet, et le
    // rayon demande le mode en tête plutôt que de barrer la route.
    const router = TestBed.inject(Router);
    const gone: unknown[] = [];
    vi.spyOn(router, 'navigate').mockImplementation((commands: unknown) => {
      gone.push(commands);
      return Promise.resolve(true);
    });

    click(FR.commande.browseTitle);

    expect(gone).toEqual([['/boutique']]);
  });

  it("l'urgence propose le rappel ET l'appel direct", () => {
    expect(text()).toContain(FR.commande.urgenceTitle);

    const tel = el().querySelector('a[href^="tel:"]');
    expect(tel?.getAttribute('href')).toBe(`tel:${PROFILE.phone.replaceAll(' ', '')}`);
  });

  it("un créneau confirmé remonte dans l'encart, et s'annule", () => {
    click(FR.commande.urgenceCta);
    expect(chrome.back()).not.toBeNull();

    click('14 h – 15 h');
    click(FR.rappel.ctaReady);

    expect(text()).toContain(fill(FR.pro.booked, { slot: '14 h – 15 h' }));
    expect(text()).toContain(PROFILE.phone);

    click(FR.pro.cancel);
    expect(text()).toContain(FR.commande.urgenceTitle);
  });

  it('change de langue à chaud, sans rechargement', () => {
    TestBed.inject(ClientLocale).current.set('it');
    fixture.detectChanges();

    expect(text()).toContain(IT.commande.pickupBadge);
    expect(chrome.kicker()).toBe(IT.chrome.kickerCommande);
  });
});

/**
 * « Modifier » depuis le panier : le choix refait ramène AU PANIER, pas au rayon.
 * Sans ce retour, changer d'heure faisait recomposer un panier déjà fait.
 */
describe('CommandePage — venue du panier', () => {
  const CHOICE: ServiceChoice = {
    mode: 'pickup',
    place: 'Le Labo',
    at: 'au Labo',
    address: 'Route de la Balme, Val d’Isère',
    slot: '7 h – 8 h',
    window: { start: '07:00', end: '08:00' },
    date: '2026-09-16',
    pickupAddressId: 'pick_labo',
  };

  const chooseFrom = (query: Record<string, string>): unknown[] => {
    TestBed.configureTestingModule({
      imports: [CommandePage],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    const gone: unknown[] = [];
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation((commands: unknown) => {
      gone.push(commands);
      return Promise.resolve(true);
    });
    const fixture = TestBed.createComponent(CommandePage);
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(PickupDialog))
      .componentInstance as PickupDialog;
    dialog.done.emit(CHOICE);
    return gone;
  };

  it('retourne au panier quand on en vient', () => {
    expect(chooseFrom({ retour: 'panier' })).toEqual([['/commande/panier']]);
  });

  it('mène au rayon sinon', () => {
    expect(chooseFrom({})).toEqual([['/boutique']]);
  });
});
