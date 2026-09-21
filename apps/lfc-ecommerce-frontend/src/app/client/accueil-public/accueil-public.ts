import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { instantToLocal, type CartAdjustment, type PickupAddressView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { ClientAudience } from '../client-audience.service';
import { ClientIdentity } from '../client-identity.service';
import { ClientWorkspace } from '../client-workspace.service';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientChrome } from '../client-chrome.service';
import { EventCard } from '../event-card/event-card';
import { EventBanner } from '../mon-espace/event-banner/event-banner';
import { ClientLocale } from '../client-locale.service';
import { ClientCopyService, fill } from '../copy/client-copy.service';
import {
  accueilPublicCopy,
  type ContactBandCopy,
  type DoorCopy,
} from '../copy/screens/accueil-public.copy';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { OrderContextStore } from '../order-context.store';
import { formatHour } from '../format-hour';
import { MOCK_EVENT } from '../mock-event';
import { bestPickupDiscount, discountLabel, pickupOffer } from '../shop/pickup-discount';
import { ServicePoints } from '../shop/pickup-points.store';
import { PublicHousePickerDialog } from '../shop/public-house-picker-dialog/public-house-picker-dialog';
import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { LiveOrdersWell } from '../mes-commandes/live-orders-well/live-orders-well';
import { isLive, rowCopyOf, trackedOf } from '../mes-commandes/order-rows';
import { ClientCart } from '../cart/client-cart.service';
import { ContactBand } from '../shop/contact-band/contact-band';
import { DeliveryAddressDialog } from '../shop/delivery-address-dialog/delivery-address-dialog';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ShopShortcuts, type ShortcutCard } from '../shop/shop-shortcuts/shop-shortcuts';
import { orderLinesSummary, orderPlaceLabel, orderWeekday } from '../shop/last-order-summary';
import { PublicSteps } from '../shop/public-steps/public-steps';
import { ServiceDoors } from '../shop/service-doors/service-doors';
import { SlotPickerDialog } from '../shop/slot-picker-dialog/slot-picker-dialog';

/**
 * **La boutique** — où l'on va une fois la maison et l'heure choisies, et aussi
 * la sortie de qui veut voir avant de choisir.
 *
 * Les deux chemins mènent au même écran, et c'est voulu : le rayon est ce que
 * le visiteur est venu chercher. L'écran du mode de service (`/nouvelle-commande`)
 * n'est plus traversé — les deux questions qu'il pose, la maison et l'heure,
 * viennent d'être posées ici.
 */
const SHOP = '/commande/boutique';

/** Une maison, telle que la carte l'affiche. */
interface House {
  readonly point: PickupAddressView;
  /** Le nom d'usage, sa ville à défaut — une carte sans titre ne se distingue pas. */
  readonly name: string;
  readonly place: string;
  /** La pastille d'offre, calculée par la fonction que lisent aussi le dialogue et le panier. */
  readonly offer: { readonly label: string; readonly hasOffer: boolean };
  /** Dérivé de la comparaison des remises, jamais saisi. */
  readonly best: boolean;
}

/**
 * **L'accueil public** — ce que voit un visiteur qui arrive sans compte
 * (dossier `handoff-bienvenue`).
 *
 * Il ne lit pas un argumentaire : il répond à une question dont la réponse lui
 * rapporte quelque chose — une remise pour la maison. Les trois verbes vivent
 * dans le titre et dans le rail des étapes ; **aucun triptyque à icônes**, il a
 * été essayé puis retiré.
 *
 * ## Ce que cet écran NE fait pas encore, et pourquoi
 *
 * 🔴 **L'étape 2 — le créneau — n'est pas branchée.** Les créneaux publics
 * existent côté serveur sur une surface **admin** seulement
 * (`documentation/order/plan-creneaux-de-retrait.md`, lot A) ; aucune route ne
 * les sert à un visiteur. Le rail montre donc l'étape comme À VENIR, et le
 * choix d'une maison mène à l'écran de commande, qui pose déjà la question du
 * mode de service. Simuler une grille d'heures ferait promettre une fournée que
 * personne n'a arrêtée.
 *
 * 🔴 **Ni le temps d'accès d'un point, ni sa date de réouverture** ne sont
 * affichés : rien dans le système ne les porte — `opening` est une FENÊTRE
 * horaire, pas un calendrier (vérifié le 2026-09-16). Le handoff les montre
 * parce qu'une maquette peut tout écrire ; un écran, non.
 */
@Component({
  selector: 'app-accueil-public',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ContactBand,
    EventBanner,
    EventCard,
    FoldCalloutComponent,
    LiveOrdersWell,
    PublicSteps,
    ServiceDoors,
    ShopShortcuts,
  ],
  templateUrl: './accueil-public.html',
  styleUrl: './accueil-public.scss',
})
export class AccueilPublic {
  private readonly points = inject(ServicePoints);
  private readonly router = inject(Router);
  /** Là où le choix VOYAGE : c'est le store que la boutique et le panier lisent. */
  private readonly order = inject(OrderContextStore);
  private readonly access = inject(ClientFeatureAccess);
  private readonly locale = inject(ClientLocale);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly c = computed(() => accueilPublicCopy(this.locale.current()));

  /** Un visiteur est `b2c` — et le défaut penche de ce côté tant qu'on ne sait pas. */
  private readonly audience = inject(ClientAudience).shown;

  private readonly auth = inject(AuthFacade);
  private readonly identity = inject(ClientIdentity);

  /**
   * TROIS ÉTATS, UN SEUL ÉCRAN (`SPEC.md` §1 du handoff du 2026-09-20).
   *
   * Le visiteur apprend ce que fait cette maison ; le client reconnu le sait
   * déjà, et la seule question qui lui reste est ce qu'il veut aujourd'hui.
   *
   * 🔴 LE PERSO CONNECTÉ SUIT LE PARCOURS DU VISITEUR, et c'est la décision
   * qui structure tout le reste : il n'a qu'un mode de service, donc rien à
   * arbitrer. Seule son ACCROCHE le reconnaît. Les deux portes et leur
   * arbitrage sont réservés au pro, qui en a deux.
   */
  protected readonly recognised = computed(() => this.auth.isAuthenticated());

  /**
   * 🔴 UN PRO EST QUELQU'UN QUI A UNE SOCIÉTÉ, VALIDÉE OU NON (Hugo,
   * 2026-09-20 : « compte pro toujours 2 cartes, validé ou pas »).
   *
   * Il a d'abord été défini par la CLIENTÈLE (`audience() === 'b2b'`), qui ne
   * bascule qu'à la validation du dossier. Deux défauts, et le second est le
   * plus coûteux :
   *
   * - un pro en cours de validation voyait la page d'un particulier, sans
   *   qu'aucun mot ne lui dise ce qui lui manquait ;
   * - la mise en page d'un pro dépendait d'un statut serveur, donc elle
   *   n'était pas observable sans un compte validé sous la main. Elle l'est
   *   maintenant dès qu'il y a une société.
   *
   * La clientèle garde son rôle, et il n'a pas changé : elle décide des PRIX et
   * de l'état de la porte du coursier. Elle ne décide plus de la mise en page.
   */
  private readonly workspace = inject(ClientWorkspace);

  protected readonly pro = computed(() => this.recognised() && this.workspace.company() !== null);

  /**
   * La porte du coursier est-elle ouverte, ou en attente ?
   *
   * Les deux conditions comptent, et pour des raisons différentes : la
   * CLIENTÈLE dit que le dossier est validé, la boutique dit qu'on peut
   * commander. Une porte ouverte sur l'une mais pas l'autre mènerait à une
   * garde.
   */
  /**
   * LA PORTE DU RETRAIT, AVEC SA REMISE.
   *
   * La mention vient de `bestPickupDiscount` — la MÊME fonction que le rail des
   * maisons, la pastille d'offre et le panier. Un second calcul serait une
   * seconde occasion d'annoncer un autre pourcentage.
   *
   * ⚠️ Sans remise, la mention est VIDE et la porte ne la dessine pas : cet
   * écran fait disparaître une preuve plutôt que d'annoncer un zéro, et une
   * porte n'y échappe pas.
   */
  protected readonly pickupDoor = computed<DoorCopy>(() => {
    const door = this.c().doors.pickup;
    const best = this.bestLabel();
    return best === null
      ? door
      : { ...door, note: fill(this.c().doors.pickupUpTo, { value: best }) };
  });

  protected readonly courierState = computed<'open' | 'pending'>(() =>
    this.audience() === 'b2b' && this.canOrder() ? 'open' : 'pending',
  );

  /** Le salut nomme, ou ne nomme pas — jamais le prénom de quelqu'un d'autre. */
  protected readonly heroTitle = computed(() => {
    const hello = this.c().hello;
    if (!this.recognised()) {
      return this.c().screenTitle;
    }
    const name = this.identity.firstName();
    return name === null ? hello.titleAnonymous : fill(hello.title, { name });
  });

  protected readonly heroKicker = computed(() =>
    this.recognised() ? this.c().hello.kicker : this.c().kicker,
  );

  protected readonly heroLede = computed(() =>
    this.recognised() ? this.c().hello.lede : this.c().lede,
  );

  /**
   * CE QUE DIT LA BANDE DE CONTACT, selon à qui elle parle.
   *
   * Trois variantes, un seul composant : le sur-titre, les boutons et l'heure
   * creuse sont des faits sur la maison et ne bougent pas ; la question qu'on
   * suppose au lecteur, elle, change avec lui. Le tri suit celui de la page —
   * un pro d'abord, puis le reconnu, puis le visiteur.
   */
  protected readonly contact = computed<ContactBandCopy>(() => {
    const contact = this.c().contact;
    const variant = this.pro()
      ? contact.pro
      : this.recognised()
        ? contact.personal
        : contact.visitor;
    return {
      kicker: contact.kicker,
      call: contact.call,
      write: contact.write,
      note: contact.note,
      ...variant,
    };
  });

  private readonly history = inject(ClientOrderHistory);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly cart = inject(ClientCart);

  /**
   * LA DERNIÈRE COMMANDE, ou `null`.
   *
   * 🔴 Elle vient de l'historique RÉEL (`ClientOrderHistory`, le plus récent en
   * tête), ET SEULEMENT POUR QUI EST RECONNU (Hugo, 2026-09-20 : « sur un
   * compte non connecté il ne peut pas y avoir comme jeudi dernier ni mes
   * suivis »).
   *
   * 🔴 La condition est `recognised()`, pas « la liste est vide ». Le magasin
   * ne se vide PAS à la déconnexion — il est `providedIn: 'root'`, et son effet
   * de lecture se contente de ne pas relire quand personne n'est connecté. Les
   * commandes du compte précédent restaient donc en mémoire, et un visiteur
   * lisait « Comme jeudi dernier » sur la commande de quelqu'un d'autre.
   *
   * C'est la faute que cette app a déjà commise trois fois, et qui est écrite
   * trois fois dans la barre du shell : se fier à un PROXY — ici une liste vide
   * — plutôt qu'à la condition réelle. Un proxy finit toujours par se
   * désaccorder de ce qu'il représente.
   *
   * ⚠️ Ceci ne dispense pas de vider le magasin à la déconnexion : cet écran
   * est protégé, les autres lecteurs de `ClientOrderHistory` ne le sont pas.
   * Signalé à Hugo.
   *
   * La même carte existe sur `/nouvelle-commande` avec « 2 traditions,
   * 4 croissants, 1 ski praliné · retrait au Labo » écrit en dur et un bouton
   * qui ne fait rien : elle montre la commande de personne. Ici, pas de
   * commande, pas de carte — un visiteur et un client de son premier jour n'ont
   * rien à reprendre, et leur proposer de le faire serait une invitation vide.
   */
  protected readonly lastOrder = computed(() =>
    this.recognised() ? (this.history.orders()[0] ?? null) : null,
  );

  /**
   * CE QUE DIT LA CARTE « OU REPRENEZ » — titre, sous-ligne, et rien d'inventé.
   *
   * Le titre ne nomme un JOUR que si la commande a moins d'une semaine : au-delà,
   * « comme mardi dernier » désignerait un mardi que le client n'a pas vécu.
   */
  /** La sortie vers le rayon, en carte — les mots viennent du dictionnaire. */
  protected readonly browseCard = computed<ShortcutCard>(() => ({
    title: this.c().shortcuts.browseTitle,
    sub: this.c().shortcuts.browseSub,
  }));

  protected readonly again = computed<ShortcutCard | null>(() => {
    const order = this.lastOrder();
    if (order === null) {
      return null;
    }
    const copy = this.c().shortcuts;
    const day = orderWeekday(order.placedAt, new Date(), this.locale.current());
    const lines = orderLinesSummary(order.lines, (count) =>
      fill(copy.againMore, { count: String(count) }),
    );
    const place = orderPlaceLabel(
      order,
      (value) => fill(copy.againPickup, { place: value }),
      copy.againDelivery,
    );
    return {
      title: day === null ? copy.againOlder : fill(copy.againRecent, { day }),
      sub: place === '' ? lines : `${lines} · ${place}`,
    };
  });

  /**
   * Combien de lignes de la dernière commande le rayon ne vend plus.
   *
   * `0` = rien à dire, et c'est l'état de départ comme celui d'un panier refait
   * en entier. Il ne se remet jamais à zéro tout seul : le message reste sous
   * les yeux tant qu'on n'a pas quitté l'écran.
   */
  protected readonly reorderGone = signal(0);

  protected readonly reorderGoneMessage = computed(() =>
    fill(this.c().shortcuts.againGone, { count: String(this.reorderGone()) }),
  );

  /**
   * CE QUI VIT : ni remis, ni annulé. Le suivi ne montre que celles-là.
   *
   * 🔴 Le filtre et la mise en forme viennent de `order-rows`, les MÊMES que
   * « Mes commandes ». Deux dérivations du même fait finissent par annoncer
   * deux étapes différentes pour une seule commande — et c'est le client qui
   * arbitre, devant un comptoir.
   */
  protected readonly tracked = computed(() => {
    // Même règle que `lastOrder` : la reconnaissance, jamais la liste.
    if (!this.recognised()) {
      return [];
    }
    const copy = rowCopyOf(this.t().orders);
    return this.history
      .orders()
      .filter((order) => isLive(order))
      .map((order) => trackedOf(order, copy));
  });

  protected readonly trackedCount = computed(() =>
    this.t().orders.wellHint.replace('{n}', String(this.tracked().length)),
  );

  protected readonly event = signal(MOCK_EVENT);

  /** Le rail des maisons, pour lire sa position de défilement. */
  private readonly rail = viewChild<ElementRef<HTMLUListElement>>('rail');

  /** Quelle maison les puces désignent — dérivé du défilement, jamais figé. */
  protected readonly railIndex = signal(0);

  /**
   * Le rail déborde-t-il vraiment ?
   *
   * 🔴 Mesuré, jamais supposé. « Faites défiler » et les puces n'ont de sens
   * que s'il reste quelque chose à atteindre : avec deux maisons sur un large
   * écran, tout tient, et la consigne devenait FAUSSE — elle demandait un geste
   * qui ne mène nulle part. Seule la largeur calculée pouvait le dire (relevé
   * le 2026-09-16 : 731 px de contenu pour 731 px de rail).
   */
  protected readonly railOverflows = signal(false);

  /**
   * Les points ont-ils été lus ?
   *
   * Le magasin n'expose aucun état de chargement : ses listes sont vides tant
   * qu'il n'a pas répondu, et vides aussi quand la plateforme n'a rien à
   * proposer. Sans ce drapeau, l'écran annoncerait « aucune maison ouverte »
   * pendant l'attente — une affirmation fausse, et la pire des trois.
   */
  protected readonly ready = signal(false);

  /** La boutique prend-elle des commandes ? Sinon, aucune maison n'est cliquable. */
  protected readonly canOrder = computed(() => this.access.shop() === 'order');

  /**
   * Les maisons, avec leur pastille d'offre.
   *
   * ⚠️ `pickupOffer` est le **lecteur unique** de ce que promet un point : la
   * carte et le dialogue se sont déjà contredits sur un pourcentage (20 % / 10 %,
   * corrigé le 2026-09-15) parce que chacun calculait le sien.
   */
  protected readonly houses = computed<readonly House[]>(() => {
    const audience = this.audience();
    const copy = this.t().pickupDialog;
    const best = bestPickupDiscount(this.points.pickups(), audience);
    let flagged = false;
    return this.points.pickups().map((point) => {
      // Le drapeau ne se pose QU'UNE fois : deux cartes « le plus avantageux »
      // ne diraient plus rien.
      const isBest = !flagged && best !== null && sameAdjustment(point.discount, best);
      if (isBest) {
        flagged = true;
      }
      return {
        point,
        name: point.label || point.ville,
        place: `${point.ville} · ${point.ligne1}`,
        offer: pickupOffer(point, audience, copy),
        best: isBest,
      };
    });
  });

  /**
   * La meilleure remise, en une étiquette — ou `null`.
   *
   * Sans remise la preuve **disparaît** au lieu d'annoncer un zéro : « −0 % au
   * retrait » serait une promesse vide écrite en gros.
   */
  protected readonly bestLabel = computed(() => {
    const best = bestPickupDiscount(this.points.pickups(), this.audience());
    return best === null ? null : fill(this.c().proof.discount, { value: discountLabel(best) });
  });

  /**
   * La plus matinale des ouvertures publiques déclarées — ou `null`.
   *
   * 🔴 C'est une OUVERTURE, pas un premier créneau, et le libellé le dit. La
   * maquette annonçait « 6 h 30 premier créneau » ; un créneau public se règle
   * désormais en back-office mais aucune route ne le sert à un visiteur, alors
   * que l'heure d'ouverture, elle, voyage déjà dans `PickupAddressView`. On
   * affiche la donnée qu'on a sous le nom qui lui revient.
   *
   * Un point qui ne reçoit pas de public porte `publicOpening: null` : il ne
   * compte pas, et si aucun n'en déclare, la preuve disparaît.
   */
  protected readonly opensAt = computed(() => {
    const starts = this.points
      .pickups()
      .map((point) => point.opening.publicOpening?.start ?? null)
      .filter((start): start is string => start !== null);
    if (starts.length === 0) {
      return null;
    }
    // `HH:MM` se compare comme du texte : 06:30 précède 07:00 sans conversion.
    return formatHour(starts.reduce((soonest, start) => (start < soonest ? start : soonest)));
  });

  protected readonly houseCount = computed(() =>
    fill(this.c().houses.count, { count: String(this.points.pickups().length) }),
  );

  constructor() {
    const chrome = inject(ClientChrome);
    chrome.kicker.set(this.c().kicker);
    // Le menu suit la RECONNAISSANCE. Un visiteur n'en a pas : la barre lui
    // donne la marque — il a besoin de savoir OÙ IL EST. Mais cet écran est
    // aussi, depuis le 2026-09-17, l'accueil d'un client connecté en perso
    // (`workspaceHomeGuard`) : lui a des affaires, et doit pouvoir y aller.
    const auth = inject(AuthFacade);
    effect(() => chrome.menu.set(auth.isAuthenticated()));
    // La lèvre s'éteint : ce qui suit la barre n'est pas une feuille crème mais
    // l'accroche d'encre de cet écran, et les deux ensemble dessinent une
    // languette au-dessus du titre (relevé le 2026-09-14 sur deux écrans).
    chrome.bandLip.set(false);
    // Et la bande sort du cadre fixe en pile : l'accroche mangerait l'écran
    // d'un téléphone. Les deux sont rallumées en partant.
    chrome.bandNarrow.set(false);
    inject(DestroyRef).onDestroy(() => {
      chrome.bandLip.set(true);
      chrome.bandNarrow.set(true);
    });

    void this.points.hydrate().finally(() => this.ready.set(true));

    // Le rail n'existe qu'une fois les points lus : on l'observe quand il
    // paraît, et on lâche l'observateur avec lui. `ResizeObserver` est absent
    // du rendu serveur — sans lui, on s'abstient plutôt que de deviner.
    effect((onCleanup) => {
      const rail = this.rail()?.nativeElement;
      if (rail === undefined || typeof ResizeObserver === 'undefined') {
        return;
      }
      const measure = (): void => {
        // Un pixel de tolérance : les largeurs sont fractionnaires, et un
        // arrondi suffirait à annoncer un débordement d'un demi-pixel.
        this.railOverflows.set(rail.scrollWidth > rail.clientWidth + 1);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(rail);
      onCleanup(() => observer.disconnect());
    });
  }

  /**
   * Quelle maison le rail montre-t-il ?
   *
   * Lu sur l'élément plutôt que sur l'événement : `Event.target` est un
   * `EventTarget`, et le convertir demanderait un cast que le dépôt s'interdit.
   */
  protected onRailScroll(): void {
    const rail = this.rail()?.nativeElement;
    const count = this.houses().length;
    if (rail === undefined || count === 0) {
      return;
    }
    const index = Math.round((rail.scrollLeft / rail.scrollWidth) * count);
    this.railIndex.set(Math.min(Math.max(index, 0), count - 1));
  }

  /**
   * Choisir une maison ouvre **l'étape 2** : à quelle heure.
   *
   * Le dialogue est la suite immédiate du choix du lieu — où et quand sont deux
   * temps d'une même question, et c'est pourquoi le lieu reste sous les yeux
   * dans son sur-titre. Fermer sans prendre d'heure ne mène nulle part : on
   * revient à l'accueil, la maison encore à portée.
   *
   * L'heure prise mène **à la boutique** ({@link SHOP}), et non plus à l'écran
   * du mode de service : ses deux questions — où, et quand — viennent d'être
   * posées ici, et les reposer serait demander deux fois la même chose.
   *
   * 🔴 **Ni la maison ni le créneau ne voyagent encore** (vérifié le
   * 2026-09-17 : la boutique s'ouvre sans les connaître). Le transport est le
   * lot suivant ; l'écrire à moitié, dans un magasin que l'autre écran ne relit
   * pas, ferait croire que le choix est passé. `/nouvelle-commande` n'est pas
   * retouché pour autant — Hugo : « on garde nouvelle commande comme c'était,
   * on revisitera plus tard » — il n'est simplement plus traversé.
   */
  protected async chooseHouse(house: House): Promise<void> {
    if (!this.canOrder()) {
      return;
    }
    const ref = SlotPickerDialog.open(this.panels, {
      pickupAddressId: house.point.id,
      place: house.name,
      // La journée vient du SERVEUR, heure limite comprise. `null` = aucune
      // journée demandable ici, et le dialogue le dit plutôt que d'en inventer.
      firstDay: this.points.nextDayFor(house.point.id),
    });
    const slot = await ref.closed;
    if (slot === undefined) {
      return;
    }

    // 🔴 LE CHOIX VOYAGE ICI, et sa forme est celle que `pickup-dialog`
    // fabrique déjà — mêmes champs, mêmes raisons : l'identité du point et
    // JAMAIS un montant (le serveur chiffre), le libellé POUR L'ÉCRAN et la
    // fenêtre POUR LE SERVEUR, la journée telle que le serveur l'a accordée.
    this.order.choice.set({
      mode: 'pickup',
      place: house.name,
      // Le complément (« au Labo ») n'a pas de source serveur : il se dérive du
      // libellé. Juste pour un lieu masculin, faux pour un féminin — c'est une
      // dette de contrat, et `pickup-dialog` la porte déjà à l'identique.
      at: `au ${house.name}`,
      address: `${house.point.ligne1}, ${house.point.ville}`,
      pickupAddressId: house.point.id,
      slot: formatHour(slot.time),
      // La fin vient de l'instant UTC du créneau, pas d'une addition d'écran :
      // le pas de découpe appartient à la règle du point, que la boutique ne
      // connaît pas.
      window: { start: slot.time, end: instantToLocal(new Date(slot.endAt)).time },
      date: slot.day,
    });

    void this.router.navigate([SHOP]);
  }

  /**
   * LA PORTE DU RETRAIT — « Choisir un point de retrait ».
   *
   * Elle rouvre le sélecteur de maisons qui existe déjà, puis retombe dans
   * `chooseHouse` : le choix voyage donc par le MÊME chemin que depuis le rail,
   * et il n'y a qu'un endroit où il s'écrit.
   *
   * ⚠️ La maquette dessine un dialogue à DEUX VOLETS (où, puis quand) ;
   * ici ce sont deux dialogues successifs, parce que ce sont ceux qui existent.
   * L'écart est assumé et signalé, pas masqué — l'enchaînement est le même pour
   * qui l'utilise.
   */
  protected async openPickupDoor(): Promise<void> {
    if (!this.canOrder()) {
      return;
    }
    const point = await PublicHousePickerDialog.open(this.panels, { currentId: null }).closed;
    if (point === undefined) {
      return;
    }
    const house = this.houses().find((candidate) => candidate.point.id === point.id);
    if (house === undefined) {
      return;
    }
    await this.chooseHouse(house);
  }

  /**
   * LA PORTE DU COURSIER — « Choisir une adresse ».
   *
   * 🔴 Elle OUVRE UN DIALOGUE depuis le 2026-09-20, là où elle menait à
   * `/nouvelle-commande` « qui porte déjà le carnet d'adresses, les zones et
   * leurs frais ». C'était vrai, et c'est précisément ce qu'on a déplacé : le
   * carnet, les zones et leurs frais vivent maintenant dans un dialogue,
   * symétrique de la porte du retrait. Les deux portes de cette page répondent
   * donc au même geste, et aucune ne quitte l'écran pour poser sa question.
   *
   * Le choix voyage par le MÊME magasin que le retrait, et mène au même rayon.
   */
  protected async openCourierDoor(): Promise<void> {
    if (!this.canOrder()) {
      return;
    }
    const choice = await DeliveryAddressDialog.open(this.panels, { currentId: null }).closed;
    if (choice === undefined) {
      return;
    }
    this.order.choice.set(choice);
    void this.router.navigate([SHOP]);
  }

  protected browse(): void {
    void this.router.navigate([SHOP]);
  }

  /** Le QR de retrait — le MÊME écran que depuis « Mes commandes ». */
  protected showQr(orderId: string): void {
    void this.router.navigate(['/mes-commandes/retrait', orderId]);
  }

  protected allOrders(): void {
    void this.router.navigate(['/mes-commandes']);
  }

  /**
   * REFAIRE la dernière commande : son panier, puis la boutique.
   *
   * 🔴 Le catalogue est RELU AVANT de poser les lignes. `itemOf` rend `null`
   * aussi bien pour une référence retirée que pour un catalogue pas encore
   * arrivé, et le panier refuse les deux de la même façon — sans la relecture,
   * un panier refait depuis un écran qui n'a jamais ouvert la boutique serait
   * VIDE, en silence.
   *
   * ⚠️ On pose des QUANTITÉS, on n'ajoute pas : reprendre deux fois la même
   * commande doit donner le même panier, pas le double.
   *
   * 🔴 CE QUE LE RAYON NE VEND PLUS SE DIT, et l'écran NE PART PAS. Le panier
   * l'aurait laissé tomber tout seul — `setQuantity` refuse une référence
   * inconnue sans un mot — et le manque se serait découvert à la caisse. Le
   * refus ne peut pas précéder l'effort ici (le catalogue n'est lu qu'au clic),
   * alors il suit immédiatement : on reste, et on compte.
   */
  protected async reorder(): Promise<void> {
    const order = this.lastOrder();
    if (order === null) {
      return;
    }
    await this.catalogue.hydrate();
    this.cart.clear();
    let gone = 0;
    for (const line of order.lines) {
      if (this.catalogue.itemOf(line.sku) === null) {
        gone += 1;
        continue;
      }
      this.cart.setQuantity(line.sku, line.quantity);
    }
    this.reorderGone.set(gone);
    if (gone === 0) {
      void this.router.navigate([SHOP]);
    }
  }
}

/** Deux remises identiques ? Comparaison par valeur : une remise n'a pas d'identité. */
function sameAdjustment(a: CartAdjustment | null, b: CartAdjustment): boolean {
  if (a === null || a.mode !== b.mode) {
    return false;
  }
  return a.mode === 'percent' && b.mode === 'percent'
    ? a.bp === b.bp
    : a.mode === 'amount' && b.mode === 'amount' && a.cents === b.cents;
}
