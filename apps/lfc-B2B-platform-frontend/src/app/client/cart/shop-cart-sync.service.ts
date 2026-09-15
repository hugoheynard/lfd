import { computed, DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { ShopCartPayload, ShopCartView } from '@lfd/contracts';
import {
  catchError,
  debounceTime,
  filter,
  finalize,
  of,
  switchMap,
  tap,
  type Observable,
  type Subscription,
} from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientWorkspace } from '../client-workspace.service';
import { CartStore } from './cart.store';
import { ShopCartGateway } from './shop-cart.gateway';

/**
 * L'accalmie au bout de laquelle on met le panier de côté, en millisecondes.
 *
 * Le même délai que le devis, et pour la même raison : un panier se compose par
 * salves, et six clics sur « + » n'ont pas à faire six écritures. Diverger de
 * trois cents millisecondes entre l'appel qui lit et celui qui écrit n'aurait
 * eu aucune justification — c'est la même salve qu'ils absorbent.
 */
const SAVE_DEBOUNCE_MS = 300;

/** Un état du panier, avec l'espace auquel il appartenait AU MOMENT du geste. */
interface Draft {
  readonly workspace: string | null;
  readonly payload: ShopCartPayload;
}

/** Un brouillon rattaché à un espace — le seul qui puisse partir. */
interface ScopedDraft extends Draft {
  readonly workspace: string;
}

/**
 * **Le panier du navigateur et celui du serveur, tenus d'accord — espace par
 * espace.**
 *
 * ## Ce que ça ouvre
 *
 * Un panier composé le matin sur un téléphone se retrouve l'après-midi au
 * bureau ; un panier laissé en plan devient visible, donc relançable ; et ce qui
 * est composé puis abandonné se mesure enfin.
 *
 * ## Un panier par espace (Hugo, 2026-09-15)
 *
 * Le perso et chaque société ont leur panier, en base comme dans le navigateur
 * (plan espace de travail, D9). La synchronisation a été **réécrite** pour ça,
 * et non amendée : l'ancienne relisait le serveur une fois par session, poussait
 * la copie locale sur toute lecture vide, et lisait l'espace à l'envoi. Les trois
 * ensemble, une bascule pendant l'accalmie écrivait les lignes d'un espace dans
 * l'autre (vitruve, B2). Ce qui les remplace :
 *
 * - **une reprise par espace**, à chaque entrée dans un espace et non une fois ;
 * - **le magasin local change d'espace AVANT la relecture** — ce qui est à
 *   l'écran pendant la lecture est déjà la copie du nouvel espace ;
 * - **l'accalmie en attente est abandonnée** : chaque état porte l'espace de son
 *   geste, et celui d'un espace quitté ne part plus. Il n'est pas perdu : la
 *   copie locale de cet espace le garde, et la reprise le départagera au retour ;
 * - **une relecture vide ne pousse rien**, sauf le panier d'un visiteur non
 *   reconnu, qui remonte **une seule fois**, dans l'espace où la personne entre
 *   à sa reconnaissance — l'espace par défaut, puisqu'aucune bascule n'a encore
 *   pu avoir lieu ;
 * - **l'écriture reçoit l'espace capturé au geste** (`gateway.save(payload,
 *   workspace)`), jamais celui du moment de l'envoi.
 *
 * ## Ce que ça ne fait PAS
 *
 * 🔴 **Rien pour qui n'est pas reconnu**, et c'est une décision. La boutique se
 * visite sans compte, et un panier serveur pour un visiteur anonyme demanderait
 * de lui poser un identifiant durable avant qu'il n'ait rien demandé.
 *
 * ## La fusion : la copie la plus RÉCENTE gagne, en entier
 *
 * Une union ligne à ligne ne sait pas représenter un retrait : un panier vidé
 * sur le téléphone se serait rempli à nouveau depuis l'ordinateur. On compare
 * donc deux dates et on garde une copie entière. Composer sur deux appareils
 * **en même temps** fait gagner le dernier geste — c'est assumé.
 *
 * Un panier local sans date est un panier d'avant la date du geste : il cède
 * devant une copie serveur.
 */
@Injectable({ providedIn: 'root' })
export class ShopCartSync {
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly gateway = inject(ShopCartGateway);
  private readonly store = inject(CartStore);
  // `takeUntilDestroyed` hors du constructeur : il lui faut la référence
  // explicite, sinon Angular lève (NG0203).
  private readonly destroyRef = inject(DestroyRef);

  /** L'espace dont le panier est synchronisé — `null` avant la première reconnaissance. */
  private synced: string | null = null;

  /**
   * Vrai quand la lecture de l'espace courant a RÉPONDU, succès ou échec.
   *
   * 🔴 Posé à la réponse et non au départ : un geste fait pendant une lecture
   * lente partait sinon avant que la reprise n'ait tranché, et l'écran divergeait
   * du serveur sans que rien ne le dise.
   */
  private resumed = false;

  /** La lecture en vol, abandonnée si l'on change d'espace avant sa réponse. */
  private reading: Subscription | null = null;

  /**
   * Ce que le serveur porte déjà pour l'espace courant, tel qu'on l'a écrit ou
   * relu — de quoi ne pas réécrire ce qu'on vient de recevoir.
   */
  private lastSaved: string | null = null;

  /** Le panier, trié pour être comparable, et l'espace dont il est la copie. */
  private readonly draft = computed<Draft>(() => ({
    workspace: this.store.scope(),
    payload: payloadOf(this.store.quantities()),
  }));

  constructor() {
    effect(() => {
      const current = this.auth.isAuthenticated() ? this.workspace.current() : null;
      if (current === null || current === this.synced) {
        return;
      }
      // `untracked` : entrer lit et écrit le dépôt, qui ne doit pas devenir une
      // dépendance de cet effet.
      untracked(() => {
        this.enter(current);
      });
    });

    toObservable(this.draft)
      .pipe(
        // 🔴 L'accalmie vient EN PREMIER, et rien ne décide avant elle : les
        // gardes lisent un état qui change pendant l'attente (la reprise, la
        // bascule). Jugé à la frappe, un état périmé partait trois cents
        // millisecondes plus tard.
        debounceTime(SAVE_DEBOUNCE_MS),
        // L'état d'un espace quitté ne part pas : c'est l'abandon de l'accalmie.
        filter(
          (draft): draft is ScopedDraft =>
            draft.workspace !== null && draft.workspace === this.synced && this.resumed,
        ),
        filter((draft) => keyOf(draft.payload) !== this.lastSaved),
        switchMap((draft) => this.push(draft.payload, draft.workspace)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /**
   * Entre dans un espace : échange le magasin local, puis relit le serveur.
   *
   * L'ordre est tout le correctif. Relire d'abord laissait à l'écran — et dans
   * ce qu'une lecture vide faisait monter — les lignes de l'espace quitté.
   */
  private enter(workspace: string): void {
    const visitor =
      this.store.scope() === null
        ? { quantities: this.store.quantities(), savedAt: this.store.savedAt() }
        : null;

    this.synced = workspace;
    this.resumed = false;
    this.lastSaved = null;
    this.reading?.unsubscribe();

    this.store.switchTo(workspace);
    // Le panier du visiteur remonte UNE fois, dans l'espace où il entre. Vide,
    // il ne remplace rien : ouvrir la boutique n'est pas composer un panier.
    const carried = visitor !== null && Object.keys(visitor.quantities).length > 0;
    if (carried) {
      this.store.replaceAll(visitor.quantities, visitor.savedAt);
    }

    this.reading = this.gateway
      .load(workspace)
      .pipe(
        tap((remote) => {
          this.reconcile(workspace, remote, carried);
        }),
        // Un échec de lecture n'est pas un panier vide : on ne touche à rien
        // de ce qui est affiché.
        catchError(() => of(null)),
        // `finalize` et non `tap` : l'écriture reprend aussi après un échec.
        // Gardé par l'espace — une lecture abandonnée par une bascule se
        // finalise aussi, et ne doit pas ouvrir l'écriture du nouvel espace.
        finalize(() => {
          if (this.synced === workspace) {
            this.resumed = true;
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private reconcile(workspace: string, remote: ShopCartView | null, carried: boolean): void {
    if (this.synced !== workspace) {
      return;
    }
    if (remote === null) {
      // 🔴 **Rien chez nous : on ne pousse RIEN**, sauf le panier que le
      // visiteur apporte. La copie locale d'un espace sans panier serveur n'a
      // pas à monter d'elle-même — c'est exactement le chemin par lequel les
      // lignes d'un espace atterrissaient dans l'autre. Le prochain geste
      // l'écrira, en entier.
      if (carried) {
        this.pushNow(workspace);
      } else {
        this.lastSaved = keyOf(payloadOf(this.store.quantities()));
      }
      return;
    }
    if (wins(this.store.savedAt(), remote.savedAt)) {
      this.pushNow(workspace);
      return;
    }
    this.lastSaved = keyOf({ lines: remote.lines });
    this.store.replaceAll(quantitiesOf(remote), remote.savedAt);
  }

  /** Écrit sans attendre l'accalmie : la reprise n'est pas une frappe. */
  private pushNow(workspace: string): void {
    this.push(payloadOf(this.store.quantities()), workspace)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  /**
   * L'écriture, et l'oubli de son échec.
   *
   * `lastSaved` est posé AU DÉPART et rétabli à l'échec : posé à la réponse, un
   * état identique sorti de l'accalmie pendant le vol partait une seconde fois.
   *
   * Un `PUT` raté ne se signale nulle part, et c'est voulu : le panier est
   * intact devant le client, et une bannière ne lui apprendrait rien qu'il
   * puisse corriger. `catchError` garde le flux vivant.
   */
  private push(payload: ShopCartPayload, workspace: string): Observable<unknown> {
    const key = keyOf(payload);
    const before = this.lastSaved;
    if (this.synced === workspace) {
      this.lastSaved = key;
    }
    return this.gateway.save(payload, workspace).pipe(
      catchError(() => {
        if (this.synced === workspace && this.lastSaved === key) {
          this.lastSaved = before;
        }
        return of(null);
      }),
    );
  }
}

/** Le panier sous la forme que le serveur attend, **trié** pour être comparable. */
function payloadOf(quantities: Readonly<Record<string, number>>): ShopCartPayload {
  return {
    lines: Object.keys(quantities)
      .sort((a, b) => a.localeCompare(b))
      .map((sku) => ({ sku, quantity: quantities[sku] ?? 0 })),
  };
}

/** La forme comparable d'un panier — deux paniers égaux ont la même clé. */
function keyOf(payload: ShopCartPayload): string {
  return JSON.stringify(payload.lines);
}

/** Les quantités par référence, telles que le dépôt les porte. */
function quantitiesOf(view: ShopCartView): Record<string, number> {
  return Object.fromEntries(view.lines.map((line) => [line.sku, line.quantity]));
}

/**
 * La copie locale l'emporte-t-elle ?
 *
 * `null` du côté local veut dire « touché à une date inconnue », donc avant
 * tout ce qui est daté. À égalité stricte, c'est le serveur qui garde la main —
 * il n'y a alors rien à écrire.
 */
function wins(localAt: string | null, remoteAt: string): boolean {
  return localAt !== null && localAt > remoteAt;
}
