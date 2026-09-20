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
import { FoldPanelHostService } from 'fold-ng';

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
import { ContactBand } from '../shop/contact-band/contact-band';
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
const SHOP = '/nouvelle-commande/boutique';

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
  imports: [ContactBand, EventBanner, EventCard, PublicSteps, ServiceDoors],
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
   * Elle mène à `/nouvelle-commande`, qui porte déjà le carnet d'adresses, les
   * zones et leurs frais. Rien n'est réécrit ici : une seconde saisie d'adresse
   * serait une seconde occasion d'annoncer d'autres frais.
   */
  protected openCourierDoor(): void {
    void this.router.navigate(['/nouvelle-commande']);
  }

  protected browse(): void {
    void this.router.navigate([SHOP]);
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
