import { HttpClient, HttpHeaders } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import type { CustomerOrderView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AccountService } from '../../account/account.service';
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
 * ## Deux listes, parce qu'il y a deux natures de commande
 *
 * Une commande appartient à une **entreprise** (`GET /companies/:id/orders`), ou
 * à **personne d'autre que son auteur** — le parcours « zéro friction », où le
 * client paie par carte sans société (`GET /orders/mine`). Les deux existent, et
 * n'en lire qu'une ferait disparaître de l'écran des commandes réellement
 * passées.
 *
 * Les deux partent **ensemble** : l'écran n'attend pas deux fois.
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
  private readonly account = inject(AccountService);

  private readonly rows = signal<readonly CustomerOrderView[]>([]);

  /** Toutes les commandes lues, **la plus récente en tête**. */
  readonly orders = this.rows.asReadonly();

  /** Ce qu'on a déjà lu : sans ce garde, l'effet rechargerait à chaque signal. */
  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        return;
      }
      // `null` est une clé légitime : quelqu'un sans entreprise n'a que ses
      // commandes personnelles, et il faut les lire aussi.
      const company = this.account.companies()[0]?.id ?? null;
      const key = company ?? 'personnel';
      if (key === this.loadedFor) {
        return;
      }
      this.loadedFor = key;
      void this.load(company);
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

  private async load(companyId: string | null): Promise<void> {
    const base = AUTH_CONFIG.apiBaseUrl;
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      const headers = { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) };
      const [personal, company] = await Promise.all([
        firstValueFrom(this.http.get<readonly CustomerOrderView[]>(`${base}/orders/mine`, headers)),
        companyId === null
          ? Promise.resolve<readonly CustomerOrderView[]>([])
          : firstValueFrom(
              this.http.get<readonly CustomerOrderView[]>(
                `${base}/companies/${companyId}/orders`,
                headers,
              ),
            ),
      ]);
      this.rows.set(sorted([...personal, ...company]));
    } catch {
      // Relisible : un échec ne doit pas condamner l'écran pour la session.
      this.loadedFor = null;
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
