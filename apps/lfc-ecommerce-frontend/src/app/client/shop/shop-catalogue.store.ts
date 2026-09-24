import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { ShopCatalogueView, ShopItemView, ShopShelfView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientWorkspace } from '../client-workspace.service';

/** La clé de la photo d'un visiteur non reconnu — la vitrine publique. */
const VISITOR = 'visiteur';

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
 *
 * _(2026-09-15)_ Le lecteur, c'est désormais **un espace** : la photo est prise
 * pour le perso, pour une société, ou pour un visiteur. Changer d'espace change
 * de tarif — la mercuriale d'une maison n'est pas celle d'une autre, et le perso
 * paie le catalogue — donc la photo se rejoue, et pour la même raison. Tant que
 * l'espace d'une personne reconnue n'est pas connu, la vitrine **attend** au
 * lieu de partir sans en-tête (plan espace de travail, D6).
 */
@Injectable({ providedIn: 'root' })
export class ShopCatalogue {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly workspace = inject(ClientWorkspace);

  private readonly state = signal<CatalogueStatus>('idle');
  /**
   * Pour QUEL lecteur la photo a été prise (ou est en cours) : l'espace, ou
   * {@link VISITOR}. `null` = aucune photo.
   *
   * Il ne sert qu'à deux choses : savoir si la photo est encore la bonne, et
   * écarter une réponse revenue après une bascule — elle porterait le tarif
   * d'un autre espace.
   */
  private photoFor: string | null = null;

  /** Quelqu'un a-t-il demandé la vitrine ? Sans demande, une bascule ne relit rien. */
  private wanted = false;
  private readonly catalogue = signal<ShopCatalogueView>({
    shelves: [],
    items: [],
    operations: [],
  });

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

  constructor() {
    // Le lecteur change — reconnaissance, espace résolu, bascule : la photo se
    // rejoue, mais seulement si quelqu'un l'a déjà demandée.
    effect(() => {
      this.readerKey();
      if (this.wanted) {
        untracked(() => {
          void this.hydrate();
        });
      }
    });
  }

  /**
   * Le lecteur du moment : {@link VISITOR}, l'espace de la personne reconnue,
   * ou `null` tant que cet espace n'est pas connu.
   */
  private readerKey(): string | null {
    return this.auth.isAuthenticated() ? this.workspace.current() : VISITOR;
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
    this.photoFor = this.readerKey();
  }

  async hydrate(): Promise<void> {
    this.wanted = true;
    const reader = this.readerKey();
    if (reader === null) {
      // Reconnu, espace pas encore connu : on attend, et l'effet relancera.
      // Une photo déjà posée reste — elle ne se remplace que par la bonne.
      if (this.state() === 'idle') {
        this.state.set('loading');
      }
      return;
    }
    // Idempotent tant que le LECTEUR n'a pas changé. Une photo prise pour un
    // visiteur ne vaut plus rien dès qu'il se reconnaît, ni celle d'un espace
    // dès qu'il en change : elle porte un autre tarif.
    const settled = this.state() === 'ready' || this.state() === 'loading';
    if (settled && this.photoFor === reader) {
      return;
    }
    this.photoFor = reader;
    this.state.set('loading');
    try {
      const view = reader === VISITOR ? await this.publicShelf() : await this.mine();
      if (this.photoFor === reader) {
        this.receive(view);
      }
    } catch {
      if (this.photoFor === reader) {
        this.state.set('failed');
      }
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
   * Aucun identifiant de société dans l'URL : l'espace part dans l'en-tête que
   * pose `workspaceInterceptor`, et le serveur le confronte aux rattachements.
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
