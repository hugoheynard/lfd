import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { ShopCatalogueView, ShopItemView, ShopShelfView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';

/** Où en est l'hydratation. `idle` = personne n'a encore ouvert la boutique. */
export type CatalogueStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * **Le catalogue, hydraté UNE fois.**
 *
 * C'est le point unique. Vingt-deux fichiers importaient le catalogue de
 * maquette en direct — le panier pour valider ses références, la relance pour
 * chercher une gourmandise, la vitrine pour ses pièces, les fiches pour leur
 * nom. Chacun était une porte sur la même donnée, et aucun ne savait qu'elle
 * viendrait un jour du réseau. Une seule porte, et la question « d'où vient le
 * catalogue » n'a plus qu'une réponse.
 *
 * ## Ce qu'il retient, et ce qu'il ne retient pas
 *
 * Les articles et les rayons tels que le serveur les rend, et rien de dérivé :
 * ce qui est filtré, cherché ou totalisé se calcule ailleurs. Un dépôt qui
 * garderait aussi sa liste filtrée aurait deux vérités à tenir d'accord.
 *
 * ## Une seule requête, et elle ne se rejoue pas
 *
 * `hydrate()` est **idempotent** : appelé deux fois, il ne redemande rien. Deux
 * écrans de la boutique s'ouvrent l'un après l'autre — le rayon puis le panier —
 * et chacun a besoin du catalogue ; sans cette garde, ouvrir son panier
 * rechargerait quatre-vingt-quinze articles pour les mêmes octets.
 *
 * 🔴 **Il n'est pas rafraîchi.** Un catalogue qui changerait sous les yeux d'un
 * client en train de composer son panier ferait bouger ses prix pendant qu'il
 * choisit. La caisse, elle, re-résout tout à la passation : c'est elle qui fait
 * foi, et c'est ce qui rend cette photo tenable.
 */
@Injectable({ providedIn: 'root' })
export class ShopCatalogue {
  private readonly http = inject(HttpClient);

  private readonly state = signal<CatalogueStatus>('idle');
  private readonly catalogue = signal<ShopCatalogueView>({ shelves: [], items: [] });

  readonly status = this.state.asReadonly();
  readonly items = computed<readonly ShopItemView[]>(() => this.catalogue().items);
  readonly shelves = computed<readonly ShopShelfView[]>(() => this.catalogue().shelves);

  /** Les articles par SKU — ce que le panier interroge à chaque ligne. */
  private readonly bySku = computed(
    () => new Map(this.catalogue().items.map((item) => [item.sku, item])),
  );

  /**
   * L'article, ou `null`.
   *
   * `null` couvre deux cas qu'on ne peut pas distinguer d'ici et qui se
   * comportent pareil : le catalogue n'est pas encore arrivé, ou la référence
   * n'existe plus. Dans les deux, il n'y a rien à montrer.
   */
  itemOf(sku: string): ShopItemView | null {
    return this.bySku().get(sku) ?? null;
  }

  /**
   * Va chercher le catalogue, une fois.
   *
   * Un échec est un ÉTAT, pas une exception qu'on avale : l'écran doit pouvoir
   * dire « la boutique n'a pas pu se charger » et proposer de réessayer, ce
   * qu'un `catch` silencieux lui retirerait.
   */
  /**
   * Pose un catalogue déjà obtenu, et le déclare prêt.
   *
   * Publique parce que les suites en ont besoin : elles posent le catalogue au
   * lieu de doubler ce dépôt, ce qui fait passer les tests par le VRAI code —
   * le même `items()`, le même `itemOf()`. Un doublé aurait pu dériver de ce
   * qu'il prétend jouer sans que rien ne rougisse.
   */
  receive(view: ShopCatalogueView): void {
    this.catalogue.set(view);
    this.state.set('ready');
  }

  async hydrate(): Promise<void> {
    if (this.state() !== 'idle' && this.state() !== 'failed') {
      return;
    }
    this.state.set('loading');
    try {
      this.receive(
        await firstValueFrom(
          this.http.get<ShopCatalogueView>(`${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`),
        ),
      );
    } catch {
      this.state.set('failed');
    }
  }
}
