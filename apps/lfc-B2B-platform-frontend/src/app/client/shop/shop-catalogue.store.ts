import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { ShopCatalogueView, ShopItemView, ShopShelfView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

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
 *
 * ## Une exception, et une seule : quand le LECTEUR change
 *
 * _(2026-09-08)_ La boutique sert deux prix. `GET /shop/catalogue` est publique
 * et rend le tarif catalogue ; `GET /shop/catalogue/mine` est murée et rend
 * celui du client — sa mercuriale, si on lui en a posé une.
 *
 * Se connecter en cours de visite doit donc faire basculer la vitrine, et c'est
 * la SEULE raison de rejouer cette photo. Elle ne contredit pas la règle
 * ci-dessus : là il s'agissait du catalogue qui bouge sous un client immobile ;
 * ici c'est le client qui change, et lui montrer encore le tarif public serait
 * lui cacher ce qu'on lui a négocié.
 */
@Injectable({ providedIn: 'root' })
export class ShopCatalogue {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly state = signal<CatalogueStatus>('idle');
  /**
   * Pour QUI la photo a été prise. `null` = personne (vitrine publique).
   *
   * On garde le fait d'être reconnu, pas l'identité : le serveur seul sait pour
   * quelle société il a résolu, et le front n'a pas à le redevenir. Ce drapeau
   * ne sert qu'à savoir si la photo est encore la bonne.
   */
  private readonly loadedForMember = signal(false);
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
    // 🔴 **Pour QUI cette photo vaut**, y compris quand elle est posée à la
    // main. Sans cette ligne, un catalogue injecté par une fixture passait pour
    // « chargé pour un visiteur » : la première suite jouant un client reconnu
    // le rejetait et redemandait le réseau, sur des tests qui n'attendaient
    // aucun appel. La réponse juste est la même dans les deux cas — la photo
    // vaut pour le lecteur du moment.
    this.loadedForMember.set(this.auth.isAuthenticated());
  }

  async hydrate(): Promise<void> {
    const member = this.auth.isAuthenticated();
    // Idempotent tant que le LECTEUR n'a pas changé. Une photo prise pour un
    // visiteur ne vaut plus rien dès qu'il se reconnaît : elle porte le tarif
    // public, et son tarif à lui est peut-être ailleurs.
    const settled = this.state() === 'ready' || this.state() === 'loading';
    if (settled && this.loadedForMember() === member) {
      return;
    }
    this.state.set('loading');
    try {
      this.receive(member ? await this.mine() : await this.publicShelf());
      this.loadedForMember.set(member);
    } catch {
      this.state.set('failed');
    }
  }

  /** La vitrine publique : le tarif catalogue, sans jeton. */
  private async publicShelf(): Promise<ShopCatalogueView> {
    return firstValueFrom(
      this.http.get<ShopCatalogueView>(`${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`),
    );
  }

  /**
   * La vitrine du client reconnu : son prix, et le tarif catalogue à barrer là
   * où il a négocié.
   *
   * Aucun identifiant de société n'est passé — le serveur la résout depuis les
   * rattachements. Le front ne choisit plus pour qui il parle, et ne peut donc
   * plus se tromper de maison.
   */
  private async mine(): Promise<ShopCatalogueView> {
    return firstValueFrom(
      this.auth.accessToken$().pipe(
        switchMap((token) =>
          this.http.get<ShopCatalogueView>(`${AUTH_CONFIG.apiBaseUrl}/shop/catalogue/mine`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      ),
    );
  }
}
