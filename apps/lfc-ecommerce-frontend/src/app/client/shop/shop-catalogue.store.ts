import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type {
  ShopCatalogueView,
  ShopItemView,
  ShopOperationView,
  ShopShelfView,
} from '@lfd/contracts';
import { defer, type Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientContext, VISITOR } from '../client-context.service';
import {
  contextKeyed,
  ContextReadAbandoned,
  type ContextKey,
  workspaceRequestOf,
} from '../context-keyed/context-keyed';
import { ProShelfSource } from './pro-shelf.source';
import { ProVisit } from './pro-visit.service';
import { ShopClock } from './shop-clock';

/** La part de clé d'un visiteur venu de `/pro` — la vitrine pro publique. */
const PRO_VISIT_PART = 'pro';

/**
 * L'âge à partir duquel une photo se relit au retour sur l'onglet (lot C4) :
 * une minute, le grain de {@link ShopClock}. Le serveur garde le rayon 30 s ;
 * relire plus souvent ne rapporterait rien.
 */
export const STALE_PHOTO_MS = 60_000;

/** Où en est l'hydratation. `idle` = personne n'a encore ouvert la boutique. */
export type CatalogueStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Une photo du catalogue, et quand elle a été prise — sur l'horloge de la boutique. */
interface Photo {
  readonly view: ShopCatalogueView;
  readonly takenAt: Date;
}

/** Une photo posée à la main ({@link ShopCatalogue.receive}), pour la clé du moment. */
interface Received {
  /** L'identité de la clé, `null` quand aucun espace ne s'affiche encore. */
  readonly id: string | null;
  readonly photo: Photo;
}

const NO_CATALOGUE: ShopCatalogueView = { shelves: [], items: [], operations: [] };

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
 *
 * ## Une seconde exception : le retour sur l'onglet, panier VIDE
 *
 * _(2026-11-04, Hugo, option b — `le-rayon-en-cache.md`, lot C4)_ Une
 * personne qui revient sur un onglet laissé ouvert retrouve une photo d'une
 * heure. {@link refreshIfStale} la relit — mais seulement quand le panier est
 * vide (c'est `ShelfRefreshOnReturn` qui en décide) : personne n'est alors en
 * train de choisir, et la règle ci-dessus tient. La photo affichée reste en
 * place pendant la relecture, et un échec la laisse telle quelle.
 *
 * ## Rangé par la brique (lot d, 2026-11-05)
 *
 * La photo se range sous la clé de contexte (`client/context-keyed/`) :
 * l'espace AFFICHÉ (`ClientContext.prefix()`), plus la visite pro pour un
 * visiteur. Rien n'est rendu pour une autre clé que celle qui s'affiche :
 * pendant la relecture qui suit une bascule vers un espace jamais vu,
 * {@link ShopCatalogue.items} est VIDE et {@link ShopCatalogue.status} vaut
 * `loading` — le panier le lit pour montrer un chargement, et le devis pour
 * attendre, au lieu de chiffrer le panier d'un espace avec le catalogue d'un
 * autre. Un retour vers un espace déjà lu réaffiche sa photo sans attendre.
 */
@Injectable({ providedIn: 'root' })
export class ShopCatalogue {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly context = inject(ClientContext);
  private readonly proVisit = inject(ProVisit);
  private readonly proShelf = inject(ProShelfSource);
  private readonly clock = inject(ShopClock);

  /** Les photos, rangées par clé de contexte — la lecture d'avance et l'oubli compris. */
  private readonly keyed = contextKeyed<Photo>((key) => this.load(key));
  /**
   * Avancé à chaque photo rangée : la brique n'est pas un signal, et l'écran
   * doit apprendre qu'elle tient une valeur neuve pour la clé affichée.
   */
  private readonly stored = signal(0);
  /** La photo posée par {@link receive}, qui vaut pour SA clé seulement. */
  private readonly received = signal<Received | null>(null);
  /** Quelqu'un a-t-il demandé la vitrine ? Sans demande, une bascule ne relit rien. */
  private readonly wanted = signal(false);
  /** La clé dont la dernière lecture a échoué — l'échec ne vaut que pour elle. */
  private readonly failedFor = signal<string | null>(null);

  /**
   * La clé du moment : l'espace AFFICHÉ (ou {@link VISITOR}), la visite pro en
   * part propre, ou `null` tant qu'aucun espace ne s'affiche.
   */
  private readonly key = computed<ContextKey | null>(
    () => {
      const prefix = this.context.prefix();
      if (prefix === null) {
        return null;
      }
      // La visite pro est une autre photo : un autre tarif, la même forme. Elle
      // n'est qu'une part de clé du catalogue, pas un contexte.
      const own = prefix === VISITOR && this.proVisit.active() ? PRO_VISIT_PART : '';
      return { workspace: prefix, own };
    },
    { equal: (a, b) => idOrNull(a) === idOrNull(b) },
  );

  /** La photo de la clé affichée, ou `undefined` : jamais celle d'une autre clé. */
  private readonly shown = computed<Photo | undefined>(() => {
    this.stored();
    const key = this.key();
    const received = this.received();
    if (received !== null && received.id === idOrNull(key)) {
      return received.photo;
    }
    return key === null ? undefined : this.keyed.shown(key);
  });

  private readonly catalogue = computed<ShopCatalogueView>(
    () => this.shown()?.view ?? NO_CATALOGUE,
  );

  /**
   * Où en est la photo de l'espace AFFICHÉ — `ready` veut dire « prête pour
   * l'espace montré », et c'est ce que le panier et le devis attendent : des
   * lignes vides sous un statut `loading` ne disent pas un panier vide.
   */
  readonly status = computed<CatalogueStatus>(() => {
    if (this.shown() !== undefined) {
      return 'ready';
    }
    if (!this.wanted()) {
      return 'idle';
    }
    const key = this.key();
    return key !== null && this.failedFor() === idOf(key) ? 'failed' : 'loading';
  });

  readonly items = computed<readonly ShopItemView[]>(() => this.catalogue().items);
  readonly shelves = computed<readonly ShopShelfView[]>(() => this.catalogue().shelves);
  /** Les opérations datées servies, l'annonce la plus récente d'abord — vide hors saison. */
  readonly operations = computed<readonly ShopOperationView[]>(() => this.catalogue().operations);

  private readonly byOperation = computed(
    () => new Map(this.catalogue().operations.map((operation) => [operation.key, operation])),
  );

  /** L'opération d'une clé, ou `null` : elle n'est pas (ou plus) servie. */
  operationOf(key: string): ShopOperationView | null {
    return this.byOperation().get(key) ?? null;
  }

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
    // La clé change — reconnaissance, espace confirmé, bascule acceptée : la
    // photo se relit (ou se reprend du rangement), si quelqu'un l'a demandée.
    effect(() => {
      this.key();
      if (untracked(this.wanted)) {
        untracked(() => {
          void this.hydrate();
        });
      }
    });
    // Une bascule commence : la photo de l'espace demandé part tout de suite,
    // sans s'afficher ; l'acceptation la reprendra dans `hydrate` (lot c). Un
    // abandon la coupe (`contextKeyed` y est relié).
    effect(() => {
      const ahead = this.context.ahead();
      if (ahead !== null && untracked(this.wanted)) {
        untracked(() => {
          this.keyed.ahead({ workspace: ahead, own: '' });
        });
      }
    });
  }

  /**
   * Pose un catalogue déjà obtenu, et le déclare prêt — pour la clé du moment.
   *
   * Publique parce que les suites en ont besoin : elles posent le catalogue au
   * lieu de doubler ce dépôt, ce qui fait passer les tests par le VRAI code —
   * le même `items()`, le même `itemOf()`. Un doublé aurait pu dériver de ce
   * qu'il prétend jouer sans que rien ne rougisse.
   *
   * 🔴 **Pour QUI cette photo vaut** : la clé affichée au moment de la pose.
   * Une bascule vers un autre espace ne la montre plus, comme une photo lue.
   */
  receive(view: ShopCatalogueView): void {
    this.received.set({ id: idOrNull(this.key()), photo: { view, takenAt: this.clock.now() } });
  }

  /**
   * Relit la photo si elle a au moins {@link STALE_PHOTO_MS} (lot C4). Rien
   * ne s'efface pendant la relecture ; une réponse revenue après une bascule
   * se range sous SA clé, sans s'afficher ; un échec garde la photo en place.
   */
  async refreshIfStale(): Promise<void> {
    const key = this.key();
    const photo = this.shown();
    if (key === null || photo === undefined) {
      return;
    }
    if (this.clock.now().getTime() - photo.takenAt.getTime() < STALE_PHOTO_MS) {
      return;
    }
    try {
      await this.keyed.read(key);
      this.settled(key);
    } catch {
      // La photo d'avant reste : moins fraîche, mais vraie au moment où elle a été prise.
    }
  }

  /**
   * Va chercher le catalogue de la clé affichée, une fois.
   *
   * **Idempotent** tant que la clé n'a pas changé : une photo tenue, ou une
   * lecture en vol, ne se redemande pas (`ensure` de la brique). Sans espace
   * affiché, on attend — l'espace retenu (lot e) part d'avance.
   *
   * Un échec est un ÉTAT, pas une exception qu'on avale : l'écran doit pouvoir
   * dire « la boutique n'a pas pu se charger » et proposer de réessayer.
   */
  async hydrate(): Promise<void> {
    this.wanted.set(true);
    const key = this.key();
    if (key === null) {
      const ahead = this.context.ahead();
      if (ahead !== null) {
        this.keyed.ahead({ workspace: ahead, own: '' });
      }
      return;
    }
    if (this.shown() !== undefined) {
      return;
    }
    const id = idOf(key);
    if (this.failedFor() === id) {
      this.failedFor.set(null);
    }
    try {
      await this.keyed.ensure(key);
      this.settled(key);
    } catch (error) {
      // Coupée : son espace ne sera pas montré, ce n'est pas un échec à dire.
      if (!(error instanceof ContextReadAbandoned)) {
        this.failedFor.set(id);
      }
    }
  }

  /** Une photo vient d'être rangée pour cette clé : elle remplace une photo posée à la main. */
  private settled(key: ContextKey): void {
    if (this.received()?.id === idOf(key)) {
      this.received.set(null);
    }
    this.stored.update((count) => count + 1);
  }

  private load(key: ContextKey): Observable<Photo> {
    return this.shelfOf(key).pipe(map((view) => ({ view, takenAt: this.clock.now() })));
  }

  /**
   * La vitrine d'une clé : publique (le tarif catalogue, sans jeton), pro
   * publique pour une visite pro, ou celle du client reconnu — son prix, et le
   * tarif catalogue à barrer là où il a négocié.
   *
   * L'espace part dans l'en-tête de LA CLÉ (`workspaceRequestOf`), jamais
   * celui de l'intercepteur : pendant une bascule, celui-ci dirait déjà
   * l'espace demandé. Le serveur le confronte aux rattachements.
   */
  private shelfOf(key: ContextKey): Observable<ShopCatalogueView> {
    if (key.workspace === VISITOR) {
      return key.own === PRO_VISIT_PART
        ? defer(() => this.proShelf.load())
        : this.http.get<ShopCatalogueView>(
            `${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`,
            workspaceRequestOf(key),
          );
    }
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<ShopCatalogueView>(
            `${AUTH_CONFIG.apiBaseUrl}/shop/catalogue/mine`,
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
          ),
        ),
      );
  }
}

function idOf(key: ContextKey): string {
  return `${key.workspace}\u0000${key.own}`;
}

function idOrNull(key: ContextKey | null): string | null {
  return key === null ? null : idOf(key);
}
