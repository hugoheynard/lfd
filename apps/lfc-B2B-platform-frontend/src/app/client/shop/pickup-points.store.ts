import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { DeliveryZoneView, FulfillmentDayView, PickupAddressView } from '@lfd/contracts';
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
 */
@Injectable({ providedIn: 'root' })
export class ServicePoints {
  private readonly http = inject(HttpClient);

  private readonly pickupList = signal<readonly PickupAddressView[]>([]);
  private readonly zoneList = signal<readonly DeliveryZoneView[]>([]);
  private readonly dayList = signal<readonly FulfillmentDayView[]>([]);
  private asked = false;

  readonly pickups = this.pickupList.asReadonly();
  readonly zones = this.zoneList.asReadonly();

  /**
   * Pose des listes déjà obtenues, et considère l'hydratation faite.
   *
   * Publique parce que les suites en ont besoin : elles posent les points au
   * lieu de doubler ce dépôt, ce qui fait passer les tests par le VRAI code —
   * la même sélection du défaut, la même résolution de zone par préfixe. Un
   * doublé aurait pu dériver de ce qu'il prétend jouer sans que rien ne rougisse.
   */
  receive(
    pickups: readonly PickupAddressView[],
    zones: readonly DeliveryZoneView[],
    days: readonly FulfillmentDayView[] = [],
  ): void {
    this.pickupList.set(pickups);
    this.zoneList.set(zones);
    this.dayList.set(days);
    this.asked = true;
  }

  /**
   * Va chercher les trois listes, une fois.
   *
   * Un échec les laisse vides : l'écran montre alors qu'il n'a rien à proposer,
   * ce qui est vrai, plutôt qu'une station de démonstration.
   */
  async hydrate(): Promise<void> {
    if (this.asked) {
      return;
    }
    this.asked = true;
    const base = AUTH_CONFIG.apiBaseUrl;
    try {
      const [pickups, zones, days] = await Promise.all([
        firstValueFrom(this.http.get<readonly PickupAddressView[]>(`${base}/pickup-addresses`)),
        firstValueFrom(this.http.get<readonly DeliveryZoneView[]>(`${base}/delivery-zones`)),
        firstValueFrom(this.http.get<readonly FulfillmentDayView[]>(`${base}/fulfillment-days`)),
      ]);
      this.pickupList.set(pickups);
      this.zoneList.set(zones);
      this.dayList.set(days);
    } catch {
      this.asked = false;
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
