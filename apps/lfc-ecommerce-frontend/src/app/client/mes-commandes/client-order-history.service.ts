import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import type {
  CompanyOrderListItemView,
  CompanyOrderSiteView,
  CustomerOrderView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { ClientWorkspace } from '../client-workspace.service';
import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { listedOf, type ListedOrder, type RowSource } from './order-rows';

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
 * Pas de compte, pas de commandes — et surtout pas celles d'un autre.
 *
 * ## Un échec se dit
 *
 * Un échec de lecture — jeton qui ne se renouvelle plus, 401, réseau — pose
 * {@link failed}. La liste vide qu'il laissait passait pour « aucune
 * commande », ce qui était faux (production, 2026-10-27).
 *
 * ## Les sites, vus du compte principal
 *
 * La liste d'une société rend aussi, pour son `owner` ou son `admin`, les
 * commandes de ses sites — chacune avec son `site` (plan
 * `documentation/comptes-client/plan-commandes-des-sites.md`, C1/C2). Le
 * filtre par site est RELU au serveur (`?site=`), jamais appliqué ici : le mur
 * est dans sa requête, et une liste filtrée à la main montrerait ce que le
 * serveur aurait refusé de rendre.
 *
 * Aucune déduction du rôle : {@link sites} est ce que la dernière liste
 * NON filtrée a nommé. Vide — un site, un principal sans héritage — et l'écran
 * ne montre ni colonne ni filtre.
 *
 * ## Les jours de retrait ou de livraison
 *
 * Le filtre « du … au … » (`plan-recapitulatif-des-commandes.md`, lot R3) est
 * relu au serveur comme le site (`?from=&to=`, bornes incluses), et se combine
 * avec lui. Une commande sans date sort dès qu'une borne est posée.
 */
/** Les bornes du filtre de jour — chacune facultative. */
export interface OrderDays {
  readonly from: string | null;
  readonly to: string | null;
}

/** Aucune borne : la valeur de repos, comparée par identité. */
export const NO_DAYS: OrderDays = { from: null, to: null };

@Injectable({ providedIn: 'root' })
export class ClientOrderHistory {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);

  private readonly rows = signal<readonly ListedOrder[]>([]);

  /** Toutes les commandes lues, **la plus récente en tête**. */
  readonly orders = this.rows.asReadonly();

  private readonly loadFailed = signal(false);

  /** La dernière lecture de la liste a échoué : l'écran le dit, au lieu d'une liste vide. */
  readonly failed = this.loadFailed.asReadonly();

  private readonly siteFilter = signal<string | null>(null);

  /** Le filtre par site : l'identifiant d'une société, ou `null` pour toutes. */
  readonly site = this.siteFilter.asReadonly();

  private readonly dayFilter = signal<OrderDays>(NO_DAYS);

  /** Les bornes posées sur le jour de retrait/livraison, `AAAA-MM-JJ` ou `null`. */
  readonly days = this.dayFilter.asReadonly();

  private readonly knownSites = signal<readonly CompanyOrderSiteView[]>([]);

  /**
   * Les sites que la liste complète porte — lus sur la dernière réponse NON
   * filtrée : filtrer sur un site ne doit pas faire disparaître les autres du
   * choix.
   */
  readonly sites = this.knownSites.asReadonly();

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
      // Un filtre et des sites ne valent que pour la société qui les a rendus.
      this.siteFilter.set(null);
      this.dayFilter.set(NO_DAYS);
      this.knownSites.set([]);
      this.loadedFor = current;
      void this.load(current, this.workspace.company()?.id ?? null);
    });
  }

  /** Pose une liste déjà obtenue — les suites s'en servent au lieu de doubler. */
  receive(orders: readonly RowSource[]): void {
    this.rows.set(
      sorted(
        orders.map((order) => ({
          ...order,
          site: order.site ?? null,
          author: order.author ?? null,
        })),
      ),
    );
    this.loadedFor = 'posé-par-la-suite';
  }

  /**
   * Relit la liste de l'espace courant — après un geste qui change une
   * commande (une annulation) : le suivi et l'historique se recalculent dessus.
   */
  reload(): void {
    const current = this.workspace.current();
    if (!this.auth.isAuthenticated() || current === null) {
      return;
    }
    this.loadedFor = current;
    void this.load(current, this.workspace.company()?.id ?? null);
  }

  /**
   * Filtre la liste sur un site — ou les montre tous (`null`) — et la RELIT.
   * Sans effet hors d'une société : le perso n'a pas de site.
   */
  chooseSite(site: string | null): void {
    if (site === this.siteFilter() || this.workspace.company() === null) {
      return;
    }
    this.siteFilter.set(site);
    this.reload();
  }

  /**
   * Borne la liste sur les jours de retrait/livraison et la RELIT. Sans effet
   * hors d'une société : `GET /orders/mine` n'a pas ce filtre.
   */
  chooseDays(days: OrderDays): void {
    const current = this.dayFilter();
    if (
      (days.from === current.from && days.to === current.to) ||
      this.workspace.company() === null
    ) {
      return;
    }
    this.dayFilter.set(days.from === null && days.to === null ? NO_DAYS : days);
    this.reload();
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
    const site = companyId === null ? null : this.siteFilter();
    const days = companyId === null ? NO_DAYS : this.dayFilter();
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      const orders = await (companyId === null
        ? this.personal(headers)
        : this.ofCompany(companyId, site, days, headers));
      // Une réponse revenue après une bascule (d'espace OU de filtre) est la
      // liste d'une autre question.
      if (this.loadedFor !== workspace || this.siteFilter() !== site || this.dayFilter() !== days) {
        return;
      }
      this.loadFailed.set(false);
      this.rows.set(sorted(orders));
      // Une liste bornée dans le temps tairait les sites sans commande ces jours-là.
      if (site === null && days === NO_DAYS) {
        this.knownSites.set(sitesOf(orders));
      }
    } catch {
      // Relisible : un échec ne doit pas condamner l'écran pour la session.
      if (this.loadedFor === workspace) {
        this.loadedFor = null;
        this.loadFailed.set(true);
      }
    }
  }

  private async personal(headers: HttpHeaders): Promise<readonly ListedOrder[]> {
    const orders = await firstValueFrom(
      this.http.get<readonly CustomerOrderView[]>(`${AUTH_CONFIG.apiBaseUrl}/orders/mine`, {
        headers,
      }),
    );
    return orders.map(listedOf);
  }

  private ofCompany(
    companyId: string,
    site: string | null,
    days: OrderDays,
    headers: HttpHeaders,
  ): Promise<readonly CompanyOrderListItemView[]> {
    let params = new HttpParams();
    for (const [name, value] of [
      ['site', site],
      ['from', days.from],
      ['to', days.to],
    ] as const) {
      if (value !== null) {
        params = params.set(name, value);
      }
    }
    return firstValueFrom(
      this.http.get<readonly CompanyOrderListItemView[]>(
        `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/orders`,
        { headers, params },
      ),
    );
  }
}

/** Les sites distincts d'une liste, dans l'ordre alphabétique de leur nom. */
function sitesOf(orders: readonly ListedOrder[]): readonly CompanyOrderSiteView[] {
  const byId = new Map<string, CompanyOrderSiteView>();
  for (const order of orders) {
    if (order.site !== null) {
      byId.set(order.site.companyId, order.site);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * La plus récente en tête, par **journée d'acheminement** puis par passation.
 *
 * C'est la journée que le client cherche — « ma commande de demain » —, pas
 * l'instant où il a cliqué. Deux commandes du même jour se départagent alors sur
 * l'heure de passation, qui est toujours présente.
 */
function sorted(orders: readonly ListedOrder[]): readonly ListedOrder[] {
  return [...orders].sort((a, b) => {
    const day = (b.requestedDeliveryDate ?? '').localeCompare(a.requestedDeliveryDate ?? '');
    return day === 0 ? b.placedAt.localeCompare(a.placedAt) : day;
  });
}
