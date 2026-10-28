import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { DeliveryZoneView, FulfillmentDayView, PickupAddressView } from '@lfd/contracts';
// Valeurs par le sous-chemin sans zod : chargé au démarrage (budget `cloudflare`).
import {
  NO_PICKUP_DISCOUNTS,
  DEFAULT_DELIVERY_AVAILABILITY,
  type PublicDeliveryAvailabilityView,
} from '@lfd/contracts/shop-values';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { PickupListGateway } from './pickup-list.gateway';

/**
 * **Où l'on est servi**, tel que la plateforme le déclare.
 *
 * Points de retrait et zones de livraison viennent de `GET /pickup-addresses`
 * et `GET /delivery-zones`, toutes deux **publiques** — comme la vitrine, et
 * pour la même raison : on choisit son mode de service avant d'avoir un compte.
 * Un client reconnu lit ses points par `GET /pickup-addresses/mine`
 * ({@link PickupListGateway}) : la liste est filtrée au serveur par sa
 * clientèle, et relue au changement d'espace (2026-10-15).
 *
 * 🔴 **Ils étaient écrits en dur dans une maquette de station**, remise et frais
 * compris. Deux conséquences que ce dépôt a payées : la remise ne pouvait être
 * qu'un pourcentage — un point qui remet un MONTANT s'affichait à zéro pendant
 * que la commande le déduisait —, et les frais voyageaient en euros flottants.
 *
 * Cette maquette n'existe plus : son dernier morceau, le carnet d'adresses, est
 * parti le 2026-09-06 vers `ClientAddresses`. Ce qu'elle portait et que le
 * serveur ne dit pas — la distance, l'heure de première fournée — n'a pas été
 * reporté : inventé À CÔTÉ d'une adresse réelle, ce n'était plus un décor mais
 * une affirmation fausse.
 *
 * 🔴 **La JOURNÉE vient d'ici aussi** (`GET /fulfillment-days`). L'écran la
 * calculait — « demain », depuis `new Date()`, c'est-à-dire depuis l'horloge du
 * navigateur du client, et sans regarder l'heure limite. Trois requêtes en une
 * seule attente : l'écran n'en subit pas le prix, et aucune des trois ne peut
 * répondre pour une station différente des deux autres.
 *
 * 🔴 **Le réglage de livraison vient d'ici aussi** (`GET /delivery-availability`) :
 * à quelle clientèle la livraison est proposée. Il se lit avec les points et
 * les zones parce qu'il répond à la même question — où et comment l'on est
 * servi — mais son échec ne fait pas tomber les trois autres : sans lui, la
 * livraison reste ouverte, ce qui est l'existant, et le serveur refuse de
 * toute façon ce qu'il a fermé (plan remise et livraison par clientèle, D5).
 */
@Injectable({ providedIn: 'root' })
export class ServicePoints {
  private readonly http = inject(HttpClient);
  private readonly list = inject(PickupListGateway);

  /**
   * Pour QUI la liste des points a été lue — {@link VISITOR} ou l'espace
   * reconnu. Depuis le 2026-10-15 (Hugo), la liste est filtrée AU SERVEUR par
   * la clientèle : celle d'un visiteur ne vaut plus dès qu'il se reconnaît, ni
   * celle d'un espace dès qu'il passe de perso à société.
   */
  private pickupsReader: string | null = null;

  private readonly pickupList = signal<readonly PickupAddressView[]>([]);
  private readonly zoneList = signal<readonly DeliveryZoneView[]>([]);
  private readonly dayList = signal<readonly FulfillmentDayView[]>([]);
  private readonly settingsHeld = signal<PublicDeliveryAvailabilityView | null>(null);
  /** Le lecteur pour qui {@link pickupList} a été RÉELLEMENT servie, ou `null`. */
  private readonly servedFor = signal<string | null>(null);
  private asked = false;

  /**
   * **Ce que le panier demande aux jours**, panier compris (D6 de
   * `architecture-operations-datees.md`) : un panier qui porte un article
   * réservé à une opération ne se voit proposer que les jours de retrait de
   * celle-ci. Chaîne vide = aucun, la réponse d'hier.
   *
   * Posée de l'extérieur par {@link CartFulfillmentDays} : ce dépôt ne lit ni
   * le panier ni le catalogue, et le rester lui évite de les charger chez tous
   * ceux qui ne veulent que des points de retrait.
   */
  private cartQuery = '';

  /** La requête dont {@link dayList} est la réponse. */
  private daysAskedFor = '';

  /**
   * Les points **proposés à qui regarde** : le serveur les a déjà filtrés par
   * sa clientèle (`GET /pickup-addresses` pour un visiteur,
   * `GET /pickup-addresses/mine` pour un client reconnu). La boutique ne filtre
   * plus elle-même ; la caisse refuse de toute façon un site fermé.
   */
  readonly pickups = this.pickupList.asReadonly();

  /**
   * Vrai quand {@link pickups} est la réponse du serveur POUR qui regarde
   * maintenant (2026-10-16). Une liste vide ne ferme le retrait qu'à ce
   * prix : pas lue, échouée, ou lue pour un autre espace, elle ne dit rien —
   * le retrait reste alors proposé, et la caisse garde le refus.
   */
  readonly pickupsKnown = computed(() => {
    const reader = this.servedFor();
    return reader !== null && reader === this.readerKey();
  });

  /** La dernière lecture des points a échoué : on ne saura pas mieux. */
  private readonly pickupsFailed = signal(false);

  /**
   * La liste est servie, OU sa lecture a échoué (2026-10-28). Ce qui dépend du
   * NOMBRE de points — la porte du retrait, qui se nomme quand il n'y en a
   * qu'un — attend ce moment plutôt que de peindre une variante puis l'autre :
   * Hugo voyait son texte une seconde avant que le texte « une seule maison »
   * ne le remplace. Un échec ne la fait pas attendre pour toujours.
   */
  readonly pickupsSettled = computed(() => this.pickupsKnown() || this.pickupsFailed());

  readonly zones = this.zoneList.asReadonly();

  /** Les journées servies, une par porte — telles que le serveur les rend. */
  readonly days = this.dayList.asReadonly();

  /**
   * Le réglage de livraison, **ouvert aux deux** tant qu'il n'est pas lu ou que
   * sa lecture a échoué : c'est l'existant, et le serveur garde la porte.
   */
  readonly deliveryAvailability = computed(
    () => this.settingsHeld() ?? DEFAULT_DELIVERY_AVAILABILITY,
  );

  /**
   * Vrai une fois le réglage RÉELLEMENT servi. Un défaut n'autorise pas à
   * effacer quoi que ce soit : seul un réglage lu peut dire qu'une livraison
   * est fermée.
   */
  readonly deliveryAvailabilityKnown = computed(() => this.settingsHeld() !== null);

  constructor() {
    // Le lecteur change — reconnaissance, espace résolu, bascule perso ↔
    // société : la liste des points se relit, mais seulement si quelqu'un l'a
    // déjà demandée.
    effect(() => {
      const reader = this.readerKey();
      if (reader !== null && this.asked && reader !== this.pickupsReader) {
        untracked(() => {
          void this.refreshPickups(reader);
        });
      }
    });
  }

  /**
   * Borne les jours au panier : les articles réservés à une opération qu'il
   * porte, et la clientèle qui commande. Relit les jours seuls quand la
   * réponse connue ne vaut plus — et rien avant la première hydratation,
   * c'est elle qui les lira.
   */
  scopeDaysTo(operationSkus: readonly string[], audience: 'pro' | 'public'): void {
    this.scopedToCart.set(operationSkus.length > 0);
    this.cartQuery =
      operationSkus.length === 0
        ? ''
        : `?skus=${encodeURIComponent(operationSkus.join(','))}&audience=${audience}`;
    if (this.asked && this.cartQuery !== this.daysAskedFor) {
      void this.refreshDays(this.cartQuery);
    }
  }

  /**
   * **Le dernier jour proposable** : le plus petit `pickupUntil` des
   * opérations dont le panier porte un article réservé, ou `null` sans article
   * réservé. Les onglets du sélecteur d'heure partent de la première journée
   * accordée et s'étendent sur une semaine : sans cette borne, ils proposaient
   * des jours que la commande refuserait. Posé par {@link CartFulfillmentDays},
   * pour la même raison que {@link scopeDaysTo}.
   */
  private readonly ceiling = signal<string | null>(null);

  /** Vrai quand les jours sont bornés par une opération que porte le panier. */
  private readonly scopedToCart = signal(false);
  readonly daysScopedToCart = this.scopedToCart.asReadonly();
  readonly lastDay = this.ceiling.asReadonly();

  capDaysAt(lastDay: string | null): void {
    this.ceiling.set(lastDay);
  }

  /**
   * Pose des listes déjà obtenues, et considère l'hydratation faite.
   *
   * Publique parce que les suites en ont besoin : elles posent les points au
   * lieu de doubler ce dépôt, ce qui fait passer les tests par le VRAI code —
   * la même résolution de zone par préfixe. Un
   * doublé aurait pu dériver de ce qu'il prétend jouer sans que rien ne rougisse.
   */
  receive(
    pickups: readonly ServedPickup[],
    zones: readonly DeliveryZoneView[],
    days: readonly ServedDay[] = [],
    settings: ServedDeliveryAvailability | null = null,
  ): void {
    this.pickupList.set(pickups.map(servedPickup));
    this.zoneList.set(zones);
    this.dayList.set(days.map(servedDay));
    this.settingsHeld.set(settings === null ? null : servedSettings(settings));
    this.asked = true;
    // La liste posée vaut pour le lecteur du moment : sans quoi l'effet la
    // remplacerait par un appel que la suite n'attend pas.
    this.pickupsReader = this.readerKey();
    this.servedFor.set(this.pickupsReader);
  }

  /**
   * Va chercher les trois listes, une fois.
   *
   * Un échec les laisse vides : l'écran montre alors qu'il n'a rien à proposer,
   * ce qui est vrai, plutôt qu'une station de démonstration.
   *
   * Le réglage de livraison a son propre repli : son échec le laisse au défaut
   * ouvert sans vider les listes — une API d'avant le réglage ne sert pas la
   * route, et la boutique doit rester celle d'hier.
   */
  async hydrate(): Promise<void> {
    if (this.asked) {
      return;
    }
    this.asked = true;
    const base = AUTH_CONFIG.apiBaseUrl;
    // Reconnu, espace pas encore connu : la liste attend, l'effet la lira.
    const reader = this.readerKey();
    try {
      const [pickups, zones, days, settings] = await Promise.all([
        reader === null ? Promise.resolve(null) : this.pickupsOf(reader),
        firstValueFrom(this.http.get<readonly DeliveryZoneView[]>(`${base}/delivery-zones`)),
        this.daysFor(this.cartQuery),
        firstValueFrom(
          this.http.get<PublicDeliveryAvailabilityView>(`${base}/delivery-availability`),
        ).catch(() => null),
      ]);
      if (pickups !== null) {
        this.pickupList.set(pickups.map(servedPickup));
        this.pickupsReader = reader;
        this.servedFor.set(reader);
        this.pickupsFailed.set(false);
      }
      this.zoneList.set(zones);
      this.dayList.set(days);
      this.settingsHeld.set(settings === null ? null : servedSettings(settings));
    } catch {
      this.asked = false;
      this.pickupsFailed.set(true);
    }
  }

  private readerKey(): string | null {
    return this.list.readerKey();
  }

  private pickupsOf(reader: string): Promise<readonly PickupAddressView[]> {
    return this.list.pickupsOf(reader);
  }

  /**
   * Relit les points seuls, au changement de lecteur. Un échec garde la liste
   * connue : la caisse refuse de toute façon un point fermé, en le nommant.
   */
  private async refreshPickups(reader: string): Promise<void> {
    this.pickupsReader = reader;
    try {
      const pickups = await this.pickupsOf(reader);
      if (this.pickupsReader === reader) {
        this.pickupList.set(pickups.map(servedPickup));
        this.servedFor.set(reader);
        this.pickupsFailed.set(false);
      }
    } catch {
      // La liste connue reste : voir plus haut.
      this.pickupsFailed.set(true);
    }
  }

  /** Les jours pour cette requête, retenus comme sa réponse. */
  /**
   * Relit les jours : une limite annoncée vient de tomber pendant que la page
   * était ouverte (2026-10-21), la réponse connue ne vaut plus.
   */
  refreshDaysNow(): void {
    if (this.asked) {
      void this.refreshDays(this.cartQuery);
    }
  }

  private async daysFor(query: string): Promise<readonly FulfillmentDayView[]> {
    this.daysAskedFor = query;
    // Typé par le contrat ; une API d'avant `orderUntil` passe par le normaliseur.
    const days = await firstValueFrom(
      this.http.get<readonly FulfillmentDayView[]>(
        `${AUTH_CONFIG.apiBaseUrl}/fulfillment-days${query}`,
      ),
    );
    return days.map(servedDay);
  }

  /**
   * Relit les jours seuls. Un échec garde les jours connus : l'écran les
   * montre, et la commande refuse de toute façon un jour hors de l'opération
   * — en nommant les bons. Le prochain changement du panier retente.
   */
  private async refreshDays(query: string): Promise<void> {
    try {
      const days = await this.daysFor(query);
      if (this.daysAskedFor === query) {
        this.dayList.set(days);
      }
    } catch {
      // Les jours connus restent : voir plus haut.
    }
  }

  /**
   * **La prochaine journée demandable** ici, ou `null`.
   *
   * `pickupAddressId` à `null` = le chemin livraison, qui ne vise aucun point et
   * suit la règle par défaut de la plateforme.
   *
   * ⚠️ Un `null` se MONTRE. Y substituer « demain » remettrait exactement ce
   * qu'on vient de retirer : une journée que l'écran affirme et que la commande
   * refuse.
   */
  nextDayFor(pickupAddressId: string | null): string | null {
    return this.dayFor(pickupAddressId)?.date ?? null;
  }

  /** La journée servie pour ce point, avec sa limite annoncée — ou `null`. */
  dayFor(pickupAddressId: string | null): FulfillmentDayView | null {
    return this.dayList().find((day) => day.pickupAddressId === pickupAddressId) ?? null;
  }

  /** La zone qui dessert ce code postal, par le MÊME préfixe que le serveur. */
  zoneFor(codePostal: string): DeliveryZoneView | null {
    const trimmed = codePostal.trim();
    return (
      this.zoneList().find((zone) =>
        zone.postalPrefixes.some((prefix) => trimmed.startsWith(prefix)),
      ) ?? null
    );
  }
}

/**
 * Un point tel qu'une API servie AVANT les remises par clientèle peut le
 * rendre : sans `discounts` (2026-10-22 ; avant, sans `discountAudiences`).
 *
 * Ce n'est pas une copie du contrat : l'appel HTTP est typé par
 * `PickupAddressView`, et ce type n'élargit que le PARAMÈTRE du normaliseur —
 * la vue du contrat y entre telle quelle.
 *
 * Le plan (§4) fait partir l'API et les fronts dans le même merge, mais un front
 * servi avant l'API lit une vue sans les nouveaux champs — et doit les tenir
 * pour ouverts, c'est-à-dire pour ce qui s'appliquait jusque-là.
 */
type ServedPickup = Omit<PickupAddressView, 'discounts'> & {
  readonly discounts?: PickupAddressView['discounts'];
};

/** Une journée telle qu'une API d'avant le 2026-10-21 la rend : sans `orderUntil`. */
type ServedDay = Omit<FulfillmentDayView, 'orderUntil'> & {
  readonly orderUntil?: string | null;
};

/** Une limite absente de la vue est inconnue : la boutique ne l'annonce pas. */
function servedDay(day: ServedDay): FulfillmentDayView {
  return { ...day, orderUntil: day.orderUntil ?? null };
}

/** Le réglage tel qu'une API partiellement à jour peut le rendre. */
type ServedDeliveryAvailability = Partial<PublicDeliveryAvailabilityView>;

/**
 * Un point sans `discounts` vient d'une API d'avant : la boutique n'y annonce
 * aucune remise plutôt que d'en inventer une — le devis, servi par le
 * serveur, dit de toute façon ce qui s'applique.
 */
function servedPickup(point: ServedPickup): PickupAddressView {
  return { ...point, discounts: point.discounts ?? NO_PICKUP_DISCOUNTS };
}

/** Une clientèle absente de la vue est tenue pour ouverte : l'existant. */
function servedSettings(settings: ServedDeliveryAvailability): PublicDeliveryAvailabilityView {
  return {
    openToB2b: settings.openToB2b ?? DEFAULT_DELIVERY_AVAILABILITY.openToB2b,
    openToB2c: settings.openToB2c ?? DEFAULT_DELIVERY_AVAILABILITY.openToB2c,
    windowMode: settings.windowMode ?? DEFAULT_DELIVERY_AVAILABILITY.windowMode,
  };
}
