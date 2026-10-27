import { computed, inject, Injectable } from '@angular/core';
import { instantToLocal } from '@lfd/contracts';
// Par le sous-chemin `shop-values`, sans zod : la même règle que le serveur
// applique au refus, et un sous-chemin qui reste léger si ce module (lazy
// aujourd'hui) devenait un jour initial (budget `cloudflare`).
import { deliveryOpenTo } from '@lfd/contracts/shop-values';
import { FoldPanelHostService } from 'fold-ng';

import { ClientAudience } from '../client-audience.service';
import { formatHour } from '../format-hour';
import { type OrderDraft, OrderContextStore, type ServiceChoice } from '../order-context.store';
import { DayPickerDialog } from './day-picker-dialog/day-picker-dialog';
import { DeliveryAddressDialog } from './delivery-address-dialog/delivery-address-dialog';
import { ServicePoints } from './pickup-points.store';
import { ServiceChangeDialog } from './service-change-dialog/service-change-dialog';
import { ServiceModeDialog } from './service-mode-dialog/service-mode-dialog';
import { PublicHousePickerDialog } from './public-house-picker-dialog/public-house-picker-dialog';
import { SlotPickerDialog } from './slot-picker-dialog/slot-picker-dialog';

/**
 * **Les portes de la commande** — retrait ou livraison, en dialogues.
 *
 * 🔴 UN SEUL ENDROIT POSE CES QUESTIONS, et un seul écrit la réponse. Elles
 * vivaient sur `/nouvelle-commande`, un ÉCRAN : le panier et la boutique y
 * envoyaient qui n'avait pas encore choisi, et on quittait donc ce qu'on était
 * en train de faire pour répondre. L'accueil public a cessé d'y aller le
 * 2026-09-20 en ouvrant les mêmes dialogues sur place — mais en recopiant la
 * séquence chez lui. Ce service la lui reprend, pour que le panier et la
 * boutique l'appellent au lieu d'en écrire une troisième version.
 *
 * ⚠️ **Il écrit dans {@link OrderContextStore} et ne navigue pas.** Où aller
 * après dépend de qui a demandé — la boutique reste où elle est, l'accueil
 * part au rayon — et un service qui déciderait de la destination obligerait
 * chaque appelant à défaire ce qu'il vient de faire.
 *
 * Il rend `true` quand un choix a été pris. Fermer un dialogue n'est pas
 * choisir : on rend `false` et rien n'est écrit, de sorte qu'un appelant ne
 * peut pas prendre une fermeture pour une réponse.
 */
@Injectable({ providedIn: 'root' })
export class OrderDoors {
  private readonly panels = inject(FoldPanelHostService);
  private readonly points = inject(ServicePoints);
  private readonly order = inject(OrderContextStore);

  /** Vrai pendant un parcours qui écrit : seul lui pose un brouillon. */
  private tracking = false;

  /** Un visiteur est `b2c` — et le défaut penche de ce côté tant qu'on ne sait pas. */
  private readonly audience = inject(ClientAudience).shown;

  /**
   * **La porte du coursier est-elle ouverte à qui regarde ?**
   *
   * Une seule décision d'admin la ferme : **le réglage « Livraison »**
   * (`openToB2b` / `openToB2c`, servi par `GET /delivery-availability`), qui
   * vise une clientèle ENTIÈRE. C'est la règle `deliveryOpenTo` que le devis et
   * la commande appliquent au serveur. La clé `publicDelivery`, qui le doublait
   * pour les particuliers, a été retirée le 2026-10-09 : deux réglages pour une
   * même porte se contredisaient.
   *
   * 🔴 Régression du 2026-09-21 (`c71efb5b5`) : le `deliveryOffered` qui lisait
   * ce réglage est parti avec l'ancien écran de commande, et cette porte-ci ne
   * le lisait pas — elle restait ouverte à la clientèle qu'il fermait, et un
   * clic menait au refus. Tant qu'il n'est pas lu, ou si sa lecture échoue, il
   * vaut son défaut ouvert à tous ({@link ServicePoints.deliveryAvailability}) :
   * la porte reste alors celle d'avant, et le serveur garde le refus.
   *
   * ⚠️ **Cacher n'est pas fermer, et les deux existent.** Le serveur refuse la
   * même chose en 409 au devis et à la commande : sans ce refus, une requête
   * recopiée depuis l'onglet réseau ferait livrer quand même. Ce signal-ci
   * évite seulement de montrer une porte qui mène à un refus.
   */
  readonly deliveryOpen = computed(() =>
    deliveryOpenTo(this.points.deliveryAvailability(), this.audience()),
  );

  /**
   * **La livraison est-elle proposée aux PROS ?** — le réglage seul, quelle que
   * soit la clientèle de qui regarde.
   *
   * C'est ce que la validation d'un dossier ouvrirait : une société en attente
   * reste `b2c` jusqu'à sa validation (`audienceOf`). L'accueil ne lui promet
   * « votre commercial ouvre la livraison » que si c'est vrai une fois validée
   * — sinon, le réglage la lui fermerait encore.
   */
  readonly deliveryOfferedToPros = computed(() =>
    deliveryOpenTo(this.points.deliveryAvailability(), 'b2b'),
  );

  /**
   * **La porte du retrait est-elle ouverte à qui regarde ?** (Hugo,
   * 2026-10-16 : plus de site par défaut, rien ne garantit qu'un site reste
   * ouvert au retrait d'une clientèle — on le laisse fermer, et on le montre.)
   *
   * Le serveur filtre déjà la liste par clientèle : elle est fermée quand
   * cette liste, SERVIE pour qui regarde, est vide. Pas encore lue ou en
   * échec, elle reste ouverte — le défaut d'hier, et la caisse refuse de toute
   * façon un retrait sans site.
   */
  readonly pickupOpen = computed(
    () => !this.points.pickupsKnown() || this.points.pickups().length > 0,
  );

  /**
   * **Peut-on servir qui regarde ?** Faux quand ni le retrait ni le coursier
   * ne lui sont proposés : l'écran le dit, au lieu d'ouvrir un parcours qui
   * finirait sur un refus.
   */
  readonly serviceOffered = computed(() => this.pickupOpen() || this.deliveryOpen());

  /**
   * **Rien n'est choisi : retrait ou coursier ?** puis la porte choisie.
   *
   * 🔴 Régression (Hugo, 2026-10-13, O6) : sans service posé, « Régler » et
   * « Choisir » ouvraient le retrait d'office, et un pro entré par la boutique
   * ne se voyait jamais proposer la livraison. La question ne se pose que si
   * le coursier est ouvert à qui regarde ({@link deliveryOpen}) : sinon il n'y
   * a rien à arbitrer, et l'on va droit au retrait. Symétrique depuis le
   * 2026-10-16 : sans retrait ({@link pickupOpen}), droit au coursier ; sans
   * l'un ni l'autre, rien ne s'ouvre et l'on rend `false`.
   */
  async choose(): Promise<boolean> {
    if (!this.serviceOffered()) {
      return false;
    }
    // Un parcours laissé en route reprend où il en était : repartir de zéro
    // redemandait « retrait ou livraison ? » à qui y avait déjà répondu (Hugo,
    // 2026-10-27, depuis la barre et le « Régler » de la boutique).
    if (this.order.draft() !== null) {
      return this.resume();
    }
    // Le JOUR d'abord (plan `plan-panneau-date.md`, 2026-10-27) : fermer le
    // panneau ne pose rien.
    return this.track({}, async () => {
      const day = await this.askDay();
      return day === null ? null : this.askChoice(day);
    });
  }

  /** Le jour, seul : `null` quand on ferme le panneau. */
  async askDay(): Promise<string | null> {
    const day = (await DayPickerDialog.open(this.panels).closed) ?? null;
    if (day !== null) {
      this.note({ date: day });
    }
    return day;
  }

  /**
   * **Reprendre le parcours là où on l'a laissé** — le geste de la barre du
   * panier tant qu'un brouillon existe (plan `plan-barre-qui-accompagne.md`).
   * Ce qui est déjà répondu ne se redemande pas ; sans brouillon, c'est
   * {@link choose}.
   */
  async resume(): Promise<boolean> {
    const draft = this.order.draft();
    if (draft === null) {
      return this.choose();
    }
    return this.track(draft, async () => {
      const day = draft.date ?? (await this.askDay());
      if (day === null) {
        return null;
      }
      if (draft.mode === 'delivery') {
        return this.askDelivery(null, day);
      }
      if (draft.mode === 'pickup') {
        return draft.pickupAddressId === undefined
          ? this.askPickup(null, day)
          : this.pickTime(
              draft.pickupAddressId,
              draft.place ?? '',
              draft.address ?? '',
              this.order.choice(),
              day,
            );
      }
      return this.askChoice(day);
    });
  }

  /**
   * **Les portes de l'accueil, jour d'abord** (Hugo, 2026-10-27 : « je ne vois
   * pas le panneau ») : « Je passe la prendre » et « On vous l'apporte »
   * passent par le même panneau que `choose()`, puis par leur porte sur ce jour.
   */
  async startPickup(): Promise<boolean> {
    // La porte dit déjà le mode, et la maison quand il n'y en a qu'une : la
    // barre du panneau du jour les montre dès la première étape.
    const served = this.points.pickups();
    const only = served.length === 1 ? served[0] : undefined;
    const start: OrderDraft =
      only === undefined ? { mode: 'pickup' } : { mode: 'pickup', ...this.houseOf(only) };
    return this.track(start, async () => {
      const day = await this.askDay();
      return day === null ? null : this.askPickup(null, day);
    });
  }

  async startDelivery(): Promise<boolean> {
    return this.track({ mode: 'delivery' }, async () => {
      const day = await this.askDay();
      return day === null ? null : this.askDelivery(null, day);
    });
  }

  /**
   * **Une maison déjà désignée** (la carte d'une maison, à l'accueil) : le
   * jour, puis l'heure de cette maison.
   */
  async startAt(pickupAddressId: string, place: string, address: string): Promise<boolean> {
    return this.track({ mode: 'pickup', place, pickupAddressId, address }, async () => {
      const day = await this.askDay();
      return day === null
        ? null
        : this.pickTime(pickupAddressId, place, address, this.order.choice(), day);
    });
  }

  /**
   * **La même question, sans écrire la réponse** — pour un écran qui compose
   * un acheminement à lui (la modification d'une commande passée, plan
   * `plan-modifier-une-commande.md`, M3) et ne doit pas toucher au choix de la
   * boutique. `null` : rien n'a été choisi.
   */
  async askChoice(day: string | null = null): Promise<ServiceChoice | null> {
    if (!this.pickupOpen()) {
      return this.askDelivery(null, day);
    }
    if (!this.deliveryOpen()) {
      return this.askPickup(null, day);
    }
    const mode = await ServiceModeDialog.open(this.panels).closed;
    if (mode === undefined) {
      return null;
    }
    this.note({ mode });
    return mode === 'delivery' ? this.askDelivery(null, day) : this.askPickup(null, day);
  }

  /**
   * **La porte du RETRAIT** : où, puis quand.
   *
   * Deux dialogues successifs et non un à deux volets — ce sont ceux qui
   * existent. L'écart avec la maquette est assumé et signalé ailleurs ;
   * l'enchaînement est le même pour qui l'utilise.
   *
   * ⚠️ Elle ne s'ouvre PAS quand {@link pickupOpen} est faux.
   *
   * Fermer le second sans prendre d'heure ne retient RIEN, pas même la maison :
   * un point de retrait sans créneau n'est pas un mode de service, et
   * l'enregistrer à moitié ferait croire la question répondue.
   */
  async pickup(currentId: string | null = null): Promise<boolean> {
    // Le jour déjà retenu suit le changement de maison (Hugo, 2026-10-27 :
    // « quand je fais changer de maison j'ai le panel heure ancien ») : sans
    // lui, l'heure s'ouvrait sur les onglets de la semaine.
    const date = this.order.choice()?.date;
    const start: OrderDraft = date === undefined ? { mode: 'pickup' } : { mode: 'pickup', date };
    return this.track(start, () => this.askPickup(currentId, date ?? null));
  }

  /** {@link pickup}, sans écrire la réponse. */
  async askPickup(
    currentId: string | null,
    day: string | null = null,
  ): Promise<ServiceChoice | null> {
    // Fermée, elle ne s'ouvre pas — comme celle du coursier.
    if (!this.pickupOpen()) {
      return null;
    }
    this.note({ mode: 'pickup' });
    // Sans jour, on le demande D'ABORD (Hugo, 2026-10-27) : le dialogue de
    // l'heure ouvert sans jour montrait encore les onglets de la semaine — le
    // vieux panneau qui mêlait jour et heure.
    const on = day ?? (await this.askDay());
    if (on === null) {
      return null;
    }
    // UNE seule maison servie : on ne demande pas de la choisir (Hugo,
    // 2026-10-27 : « le parcours doit faire date, heure ») — elle est prise.
    const served = this.points.pickups();
    const point =
      served.length === 1
        ? served[0]
        : await PublicHousePickerDialog.open(this.panels, { currentId, day: on }).closed;
    if (point === undefined) {
      return null;
    }
    this.note(this.houseOf(point));
    return this.pickTime(
      point.id,
      point.label || point.ville,
      `${point.ligne1}, ${point.ville}`,
      this.order.choice(),
      on,
    );
  }

  /**
   * **Rouvrir l'heure seule**, la maison étant déjà prise.
   *
   * ⚠️ Changer de maison PÉRIME l'heure — les créneaux sont ceux d'un point —
   * mais changer d'heure ne périme pas la maison. D'où deux entrées, et non un
   * drapeau sur la même.
   */
  async time(pickupAddressId: string, place: string, address: string): Promise<boolean> {
    const date = this.order.choice()?.date;
    const start: OrderDraft = { mode: 'pickup', place, pickupAddressId, address };
    return this.track(date === undefined ? start : { ...start, date }, () =>
      // Le jour retenu : « Modifier » rouvre l'étape 2 sur lui, avec « Je
      // change de date », et non les onglets de la semaine (Hugo, 2026-10-27).
      this.pickTime(pickupAddressId, place, address, this.order.choice(), date ?? null),
    );
  }

  /**
   * **« Modifier » une commande située** : un panneau demande ce qu'on change
   * — le mode, la date, l'heure, la maison ou l'adresse — et ne rouvre que
   * cette étape (Hugo, 2026-10-27 : « tout me ramène à l'étape 2 »). Ce qui
   * n'est pas changé est gardé : le jour suit une bascule de mode, la maison
   * suit un changement de date. Sans choix, c'est {@link choose}.
   */
  async modify(): Promise<boolean> {
    const choice = this.order.choice();
    if (choice === null) {
      return this.choose();
    }
    const pickup = choice.mode === 'pickup';
    const house =
      choice.mode === 'pickup' && choice.pickupAddressId !== null
        ? { id: choice.pickupAddressId, place: choice.place, address: choice.address }
        : null;
    const deliveryId = choice.mode === 'delivery' ? (choice.deliveryAddressId ?? null) : null;
    // Le brouillon part du choix : la barre du pied le dit dès le panneau.
    const start: OrderDraft =
      house === null
        ? { mode: choice.mode, date: choice.date }
        : {
            mode: 'pickup',
            date: choice.date,
            place: house.place,
            pickupAddressId: house.id,
            address: house.address,
          };
    return this.track(start, async () => {
      const change = await ServiceChangeDialog.open(this.panels, {
        mode: choice.mode,
        otherOpen: pickup ? this.deliveryOpen() : this.pickupOpen(),
        severalPlaces: this.points.pickups().length > 1,
      }).closed;
      switch (change) {
        case undefined:
          return null;
        case 'mode':
          return pickup ? this.askDelivery(null, choice.date) : this.askPickup(null, choice.date);
        case 'place':
          return this.askPickup(house?.id ?? null, choice.date);
        case 'address':
          return this.askDelivery(deliveryId, choice.date);
        case 'time':
          return house === null
            ? this.askPickup(null, choice.date)
            : this.pickTime(house.id, house.place, house.address, choice, choice.date);
        case 'date': {
          const day = await this.askDay();
          if (day === null) {
            return null;
          }
          if (!pickup) {
            return this.askDelivery(deliveryId, day);
          }
          return house === null
            ? this.askPickup(null, day)
            : this.pickTime(house.id, house.place, house.address, choice, day);
        }
      }
    });
  }

  /**
   * {@link time}, sans écrire la réponse — `current` est le choix dont
   * l'heure se marque « Votre choix ».
   */
  askTime(current: ServiceChoice & { readonly mode: 'pickup' }): Promise<ServiceChoice | null> {
    if (current.pickupAddressId === null) {
      return Promise.resolve(null);
    }
    return this.pickTime(current.pickupAddressId, current.place, current.address, current);
  }

  /**
   * **La porte du COURSIER** : l'adresse, et rien d'autre.
   *
   * Aucune grille d'heures : le dialogue d'adresse rend un mode de service
   * COMPLET, fenêtre comprise (c'est-à-dire `null`, et son composant dit
   * pourquoi). Il n'y a donc pas de second volet à enchaîner.
   *
   * ⚠️ Elle ne s'ouvre PAS quand {@link deliveryOpen} est faux — elle rend
   * `false` sans rien montrer. L'appelant qui cache déjà sa porte n'y arrive
   * jamais ; celui qui l'aurait oubliée ne fait pas de dégât.
   */
  async delivery(
    currentId: string | null = null,
    currentDate: string | null = null,
  ): Promise<boolean> {
    return this.track({ mode: 'delivery' }, () => this.askDelivery(currentId, currentDate));
  }

  /** {@link delivery}, sans écrire la réponse. */
  async askDelivery(
    currentId: string | null,
    currentDate: string | null = null,
  ): Promise<ServiceChoice | null> {
    if (!this.deliveryOpen()) {
      return null;
    }
    this.note({ mode: 'delivery' });
    const choice = await DeliveryAddressDialog.open(this.panels, {
      currentId,
      // Le jour déjà retenu se repropose (2026-10-13) : rouvrir pour changer
      // d'adresse ne doit pas ramener en silence à la première journée.
      currentDate,
      // 🔴 LA SAISIE LIBRE EST POUR LE B2C, et elle lui est réservée. Un pro
      // tape une adresse hors de son carnet, et c'est une livraison que
      // personne ne retrouve au bon de livraison suivant ; un visiteur n'a pas
      // de carnet du tout, et sans elle il ne peut pas se faire livrer.
      allowFreeEntry: this.audience() !== 'b2b',
    }).closed;
    return choice ?? null;
  }

  /** Écrit un choix pris ; `false` quand il n'y en a pas — fermer n'est pas choisir. */
  private write(choice: ServiceChoice | null): boolean {
    if (choice === null) {
      return false;
    }
    this.order.choice.set(choice);
    // Le choix complet remplace le brouillon : la barre dit le service retenu.
    this.order.draft.set(null);
    return true;
  }

  /**
   * Un parcours qui ÉCRIT : son brouillon se pose dans le store à chaque étape
   * ({@link note}). Les `ask*` appelés seuls — la modification d'une commande
   * passée — ne touchent pas au brouillon de la boutique.
   *
   * Fermé en route, le brouillon reste — sauf s'il ne dit rien, ou si un choix
   * complet existe déjà : « Modifier » abandonné laisse le service tel quel, et
   * c'est lui que la barre doit dire.
   */
  private async track(
    start: OrderDraft,
    run: () => Promise<ServiceChoice | null>,
  ): Promise<boolean> {
    this.order.draft.set(start);
    this.tracking = true;
    try {
      const choice = await run();
      if (choice === null) {
        const draft = this.order.draft();
        if (draft === null || Object.keys(draft).length === 0 || this.order.choice() !== null) {
          this.order.draft.set(null);
        }
      }
      return this.write(choice);
    } finally {
      this.tracking = false;
    }
  }

  /** Complète le brouillon — seulement dans un parcours qui écrit ({@link track}). */
  private note(step: OrderDraft): void {
    if (this.tracking) {
      this.order.draft.update((draft) => ({ ...draft, ...step }));
    }
  }

  /** Ce que le brouillon retient d'une maison. */
  private houseOf(point: {
    readonly id: string;
    readonly label: string;
    readonly ligne1: string;
    readonly ville: string;
  }): OrderDraft {
    return {
      place: point.label || point.ville,
      pickupAddressId: point.id,
      address: `${point.ligne1}, ${point.ville}`,
    };
  }

  /**
   * Le créneau retenu à CE point, pour que le dialogue le marque « Votre
   * choix » — `null` ailleurs : une heure du Labo n'existe pas au Village.
   */
  private currentAt(
    pickupAddressId: string,
    choice: ServiceChoice | null,
  ): { day: string; time: string } | null {
    const time = choice?.mode === 'pickup' ? choice.window?.start : undefined;
    return choice?.mode === 'pickup' &&
      choice.pickupAddressId === pickupAddressId &&
      time !== undefined &&
      time !== null
      ? { day: choice.date, time }
      : null;
  }

  /**
   * L'heure d'un point, puis l'écriture du choix.
   *
   * 🔴 La forme du choix est celle que `pickup-dialog` fabrique déjà — mêmes
   * champs, mêmes raisons : l'identité du point et JAMAIS un montant (le
   * serveur chiffre), le libellé POUR L'ÉCRAN et la fenêtre POUR LE SERVEUR, la
   * journée telle que le serveur l'a accordée.
   */
  private async pickTime(
    pickupAddressId: string,
    place: string,
    address: string,
    current: ServiceChoice | null,
    openOn: string | null = null,
  ): Promise<ServiceChoice | null> {
    const slot = await SlotPickerDialog.open(this.panels, {
      pickupAddressId,
      place,
      // La journée vient du SERVEUR, heure limite comprise. `null` = aucune
      // journée demandable ici, et le dialogue le dit plutôt que d'en inventer.
      firstDay: this.points.nextDayFor(pickupAddressId),
      lastDay: this.points.lastDay(),
      current: this.currentAt(pickupAddressId, current),
      // Le jour pris au panneau du jour : le dialogue s'ouvre dessus.
      openOn,
    }).closed;
    if (slot === undefined) {
      return null;
    }
    return {
      mode: 'pickup',
      place,
      // Le complément (« au Labo ») n'a pas de source serveur : il se dérive du
      // libellé. Juste pour un lieu masculin, faux pour un féminin — c'est une
      // dette de contrat, et `pickup-dialog` la porte déjà à l'identique.
      at: `au ${place}`,
      address,
      pickupAddressId,
      slot: formatHour(slot.time),
      // La fin vient de l'instant UTC du créneau, pas d'une addition d'écran :
      // le pas de découpe appartient à la règle du point, que la boutique ne
      // connaît pas.
      window: { start: slot.time, end: instantToLocal(new Date(slot.endAt)).time },
      date: slot.day,
    };
  }
}
