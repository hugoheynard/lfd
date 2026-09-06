import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { DeliveryZoneView, PickupAddressView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';

/**
 * **Où l'on est servi**, tel que la plateforme le déclare.
 *
 * Points de retrait et zones de livraison viennent de `GET /pickup-addresses`
 * et `GET /delivery-zones`, toutes deux **publiques** — comme la vitrine, et
 * pour la même raison : on choisit son mode de service avant d'avoir un compte.
 *
 * 🔴 **Ils étaient écrits en dur dans `mock-station.ts`**, remise et frais
 * compris. Deux conséquences que ce dépôt a payées : la remise ne pouvait être
 * qu'un pourcentage — un point qui remet un MONTANT s'affichait à zéro pendant
 * que la commande le déduisait —, et les frais voyageaient en euros flottants.
 *
 * Ce qui reste dans la maquette est ce que le serveur ne dit pas : la distance,
 * l'heure de première fournée. Ce ne sont pas des données de commerce, et les
 * inventer À CÔTÉ d'une adresse réelle en aurait fait des affirmations fausses
 * plutôt qu'un décor — d'où leur retrait plutôt que leur report.
 */
@Injectable({ providedIn: 'root' })
export class ServicePoints {
  private readonly http = inject(HttpClient);

  private readonly pickupList = signal<readonly PickupAddressView[]>([]);
  private readonly zoneList = signal<readonly DeliveryZoneView[]>([]);
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
  receive(pickups: readonly PickupAddressView[], zones: readonly DeliveryZoneView[]): void {
    this.pickupList.set(pickups);
    this.zoneList.set(zones);
    this.asked = true;
  }

  /**
   * Va chercher les deux listes, une fois.
   *
   * Un échec laisse les listes vides : l'écran montre alors qu'il n'a rien à
   * proposer, ce qui est vrai, plutôt qu'une station de démonstration.
   */
  async hydrate(): Promise<void> {
    if (this.asked) {
      return;
    }
    this.asked = true;
    const base = AUTH_CONFIG.apiBaseUrl;
    try {
      const [pickups, zones] = await Promise.all([
        firstValueFrom(this.http.get<readonly PickupAddressView[]>(`${base}/pickup-addresses`)),
        firstValueFrom(this.http.get<readonly DeliveryZoneView[]>(`${base}/delivery-zones`)),
      ]);
      this.pickupList.set(pickups);
      this.zoneList.set(zones);
    } catch {
      this.asked = false;
    }
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
