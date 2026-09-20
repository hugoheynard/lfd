import { HttpClient, HttpHeaders } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import type { CustomerOrderView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { ClientWorkspace } from '../client-workspace.service';
import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * **Les commandes du client**, telles que notre base les porte.
 *
 * 🔴 L'écran lisait un fichier de maquette : deux suivis et six lignes
 * d'historique écrits en dur, avec leurs références et leurs montants. Il
 * montrait donc les commandes de personne, à côté d'un panier qui, lui, partait
 * vraiment au serveur.
 *
 * ## Une liste par espace de travail
 *
 * Une commande appartient à une **entreprise** (`GET /companies/:id/orders`), ou
 * à **personne d'autre que son auteur** — le perso, où le client paie par carte
 * sans société (`GET /orders/mine`, qui ne rend que celles-là : vérifié le
 * 2026-09-15, `ListPersonalOrdersQuery`).
 *
 * L'historique suit l'**espace** (`ClientWorkspace`, plan D7) : en perso les
 * commandes perso, dans une société les siennes. Il les mêlait tant que
 * l'espace n'existait pas ; il **attend** désormais l'espace connu, et se vide
 * à une bascule avant de relire.
 *
 * ## Rien pour un visiteur anonyme
 *
 * Pas de compte, pas de commandes — et surtout pas celles d'un autre. Un échec
 * de lecture laisse la liste vide : l'écran montre alors qu'il n'a rien à
 * afficher, ce qui est vrai.
 */
@Injectable({ providedIn: 'root' })
export class ClientOrderHistory {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);

  private readonly rows = signal<readonly CustomerOrderView[]>([]);

  /** Toutes les commandes lues, **la plus récente en tête**. */
  readonly orders = this.rows.asReadonly();

  /** Ce qu'on a déjà lu : sans ce garde, l'effet rechargerait à chaque signal. */
  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      const current = this.workspace.current();
      if (!this.auth.isAuthenticated() || current === null || current === this.loadedFor) {
        return;
      }
      if (this.loadedFor !== null && this.loadedFor !== 'posé-par-la-suite') {
        // Les commandes de l'espace quitté ne restent pas à l'écran pendant la relecture.
        this.rows.set([]);
      }
      this.loadedFor = current;
      void this.load(current, this.workspace.company()?.id ?? null);
    });
  }

  /** Pose une liste déjà obtenue — les suites s'en servent au lieu de doubler. */
  receive(orders: readonly CustomerOrderView[]): void {
    this.rows.set(sorted(orders));
    this.loadedFor = 'posé-par-la-suite';
  }

  /**
   * **Une** commande, relue au serveur.
   *
   * Une lecture propre plutôt qu'une pioche dans la liste déjà chargée : un lien
   * ouvert directement — un QR de retrait rouvert le lendemain — n'a aucune
   * liste derrière lui, et faire dépendre l'écran d'un chargement préalable le
   * casserait exactement dans le cas où il sert.
   *
   * `null` couvre les deux refus, et c'est voulu : le serveur rend **404** aussi
   * bien pour une commande qui n'existe pas que pour celle d'un autre. L'écran
   * n'a pas à distinguer — dans les deux cas il n'y a rien à montrer.
   */
  async byId(orderId: string): Promise<CustomerOrderView | null> {
    if (!this.auth.isAuthenticated()) {
      return null;
    }
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      return await firstValueFrom(
        this.http.get<CustomerOrderView>(`${AUTH_CONFIG.apiBaseUrl}/orders/${orderId}`, {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
        }),
      );
    } catch {
      return null;
    }
  }

  private async load(workspace: string, companyId: string | null): Promise<void> {
    const base = AUTH_CONFIG.apiBaseUrl;
    const url =
      companyId === null ? `${base}/orders/mine` : `${base}/companies/${companyId}/orders`;
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      const orders = await firstValueFrom(
        this.http.get<readonly CustomerOrderView[]>(url, {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
        }),
      );
      // Une réponse revenue après une bascule est l'historique d'un autre espace.
      if (this.loadedFor === workspace) {
        this.rows.set(sorted(orders));
      }
    } catch {
      // Relisible : un échec ne doit pas condamner l'écran pour la session.
      if (this.loadedFor === workspace) {
        this.loadedFor = null;
      }
    }
  }
}

/**
 * La plus récente en tête, par **journée d'acheminement** puis par passation.
 *
 * C'est la journée que le client cherche — « ma commande de demain » —, pas
 * l'instant où il a cliqué. Deux commandes du même jour se départagent alors sur
 * l'heure de passation, qui est toujours présente.
 */
function sorted(orders: readonly CustomerOrderView[]): readonly CustomerOrderView[] {
  return [...orders].sort((a, b) => {
    const day = (b.requestedDeliveryDate ?? '').localeCompare(a.requestedDeliveryDate ?? '');
    return day === 0 ? b.placedAt.localeCompare(a.placedAt) : day;
  });
}
