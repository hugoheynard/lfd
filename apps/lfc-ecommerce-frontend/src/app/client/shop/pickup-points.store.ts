import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { DeliveryZoneView, FulfillmentDayView, PickupAddressView } from '@lfd/contracts';
// Valeurs par le sous-chemin sans zod : chargé au démarrage (budget `cloudflare`).
import {
  ALL_DISCOUNT_AUDIENCES,
  DEFAULT_DELIVERY_AVAILABILITY,
  type PublicDeliveryAvailabilityView,
} from '@lfd/contracts/shop-values';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';

/**
 * **Où l'on est servi**, tel que la plateforme le déclare.
 *
 * Points de retrait et zones de livraison viennent de `GET /pickup-addresses`
 * et `GET /delivery-zones`, toutes deux **publiques** — comme la vitrine, et
 * pour la même raison : on choisit son mode de service avant d'avoir un compte.
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

  private readonly pickupList = signal<readonly PickupAddressView[]>([]);
  private readonly zoneList = signal<readonly DeliveryZoneView[]>([]);
  private readonly dayList = signal<readonly FulfillmentDayView[]>([]);
  private readonly settingsHeld = signal<PublicDeliveryAvailabilityView | null>(null);
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

  readonly pickups = this.pickupList.asReadonly();
  readonly zones = this.zoneList.asReadonly();

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

  /**
   * Borne les jours au panier : les articles réservés à une opération qu'il
   * porte, et la clientèle qui commande. Relit les jours seuls quand la
   * réponse connue ne vaut plus — et rien avant la première hydratation,
   * c'est elle qui les lira.
   */
  scopeDaysTo(operationSkus: readonly string[], audience: 'pro' | 'public'): void {
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
  readonly lastDay = this.ceiling.asReadonly();

  capDaysAt(lastDay: string | null): void {
    this.ceiling.set(lastDay);
  }

  /**
   * Pose des listes déjà obtenues, et considère l'hydratation faite.
   *
   * Publique parce que les suites en ont besoin : elles posent les points au
   * lieu de doubler ce dépôt, ce qui fait passer les tests par le VRAI code —
   * la même sélection du défaut, la même résolution de zone par préfixe. Un
   * doublé aurait pu dériver de ce qu'il prétend jouer sans que rien ne rougisse.
   */
  receive(
    pickups: readonly ServedPickup[],
    zones: readonly DeliveryZoneView[],
    days: readonly FulfillmentDayView[] = [],
    settings: ServedDeliveryAvailability | null = null,
  ): void {
    this.pickupList.set(pickups.map(servedPickup));
    this.zoneList.set(zones);
    this.dayList.set(days);
    this.settingsHeld.set(settings === null ? null : servedSettings(settings));
    this.asked = true;
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
    try {
      const [pickups, zones, days, settings] = await Promise.all([
        firstValueFrom(this.http.get<readonly PickupAddressView[]>(`${base}/pickup-addresses`)),
        firstValueFrom(this.http.get<readonly DeliveryZoneView[]>(`${base}/delivery-zones`)),
        this.daysFor(this.cartQuery),
        firstValueFrom(
          this.http.get<PublicDeliveryAvailabilityView>(`${base}/delivery-availability`),
        ).catch(() => null),
      ]);
      this.pickupList.set(pickups.map(servedPickup));
      this.zoneList.set(zones);
      this.dayList.set(days);
      this.settingsHeld.set(settings === null ? null : servedSettings(settings));
    } catch {
      this.asked = false;
    }
  }

  /** Les jours pour cette requête, retenus comme sa réponse. */
  private async daysFor(query: string): Promise<readonly FulfillmentDayView[]> {
    this.daysAskedFor = query;
    return firstValueFrom(
      this.http.get<readonly FulfillmentDayView[]>(
        `${AUTH_CONFIG.apiBaseUrl}/fulfillment-days${query}`,
      ),
    );
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
    return this.dayList().find((day) => day.pickupAddressId === pickupAddressId)?.date ?? null;
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
 * Un point tel qu'une API servie AVANT les clientèles de remise peut le rendre :
 * sans `discountAudiences`.
 *
 * Ce n'est pas une copie du contrat : l'appel HTTP est typé par
 * `PickupAddressView`, et ce type n'élargit que le PARAMÈTRE du normaliseur —
 * la vue du contrat y entre telle quelle.
 *
 * Le plan (§4) fait partir l'API et les fronts dans le même merge, mais un front
 * servi avant l'API lit une vue sans les nouveaux champs — et doit les tenir
 * pour ouverts, c'est-à-dire pour ce qui s'appliquait jusque-là.
 */
type ServedPickup = Omit<PickupAddressView, 'discountAudiences'> & {
  readonly discountAudiences?: PickupAddressView['discountAudiences'];
};

/** Le réglage tel qu'une API partiellement à jour peut le rendre. */
type ServedDeliveryAvailability = Partial<PublicDeliveryAvailabilityView>;

/** Un point sans clientèles déclarées reçoit la remise pour tous : l'existant. */
function servedPickup(point: ServedPickup): PickupAddressView {
  return { ...point, discountAudiences: point.discountAudiences ?? ALL_DISCOUNT_AUDIENCES };
}

/** Une clientèle absente de la vue est tenue pour ouverte : l'existant. */
function servedSettings(settings: ServedDeliveryAvailability): PublicDeliveryAvailabilityView {
  return {
    openToB2b: settings.openToB2b ?? DEFAULT_DELIVERY_AVAILABILITY.openToB2b,
    openToB2c: settings.openToB2c ?? DEFAULT_DELIVERY_AVAILABILITY.openToB2c,
  };
}
