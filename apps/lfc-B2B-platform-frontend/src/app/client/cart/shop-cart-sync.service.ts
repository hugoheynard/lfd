import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { ShopCartPayload, ShopCartView } from '@lfd/contracts';
import { catchError, debounceTime, filter, finalize, of, switchMap, tap } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
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

/**
 * **Le panier du navigateur et celui du serveur, tenus d'accord.**
 *
 * ## Ce que ça ouvre
 *
 * Un panier composé le matin sur un téléphone se retrouve l'après-midi au
 * bureau ; un panier laissé en plan devient visible, donc relançable ; et ce qui
 * est composé puis abandonné se mesure enfin. Aucune de ces trois choses n'était
 * possible tant que le panier vivait sous une clé de `localStorage`.
 *
 * ## Ce que ça ne fait PAS
 *
 * 🔴 **Rien pour qui n'est pas reconnu**, et c'est une décision. La boutique se
 * visite sans compte — `GET /shop/catalogue` et `POST /shop/quote` sont publics
 * — et un panier serveur pour un visiteur anonyme demanderait de lui poser un
 * identifiant durable avant qu'il n'ait rien demandé. Le navigateur reste donc
 * la mémoire de qui n'a pas de compte, et sa copie remonte à la première visite
 * reconnue.
 *
 * ## La fusion : la copie la plus RÉCENTE gagne, en entier
 *
 * La tentation était de fusionner ligne à ligne — l'union des deux paniers, la
 * quantité locale l'emportant. C'est plus doux, et c'est faux : un panier vidé
 * sur le téléphone se serait rempli à nouveau depuis l'ordinateur, et retirer
 * une pièce n'aurait jamais pu traverser. Une union ne sait pas représenter un
 * retrait.
 *
 * On compare donc deux dates et on garde une copie entière. Ce que ça coûte est
 * réel et assumé : composer sur deux appareils **en même temps**, et le dernier
 * geste efface l'autre panier. C'est ce que le `localStorage` faisait déjà entre
 * deux onglets ; il le faisait simplement sans qu'on puisse le nommer.
 *
 * Un panier local sans date est un panier d'AVANT ce chantier : il est traité
 * comme le plus ancien, donc il cède devant une copie serveur. Il n'y en a
 * aucune le jour du déploiement — la table naît vide —, donc en pratique il
 * remonte.
 */
@Injectable({ providedIn: 'root' })
export class ShopCartSync {
  private readonly auth = inject(AuthFacade);
  private readonly gateway = inject(ShopCartGateway);
  private readonly store = inject(CartStore);
  // `takeUntilDestroyed` sans contexte d'injection : ces flux partent d'un
  // effet et d'une méthode, pas du constructeur. Il lui faut donc la référence
  // explicite, sinon Angular lève (NG0203).
  private readonly destroyRef = inject(DestroyRef);

  /** Vrai dès que la lecture est PARTIE — de quoi ne pas la relancer. */
  private readonly resuming = signal(false);

  /**
   * Vrai quand la lecture a RÉPONDU, succès ou échec.
   *
   * 🔴 Deux drapeaux et non un, et l'écart entre les deux est exactement le
   * défaut qu'ils réparent. En n'en gardant qu'un, posé au départ de la lecture,
   * un geste fait pendant une réponse lente partait au serveur trois cents
   * millisecondes plus tard — avant que la reprise n'ait tranché. Le serveur
   * recevait alors la copie locale, puis l'écran affichait la copie distante :
   * les deux divergeaient, et rien ne le disait.
   */
  private readonly resumed = signal(false);

  /**
   * Ce que le serveur porte déjà, tel qu'on l'a écrit ou relu.
   *
   * Sans cette mémoire, la reprise déclencherait aussitôt une écriture de ce
   * qu'on vient de recevoir — un aller-retour pour rien à chaque chargement de
   * page.
   */
  private lastSaved: string | null = null;

  /** Le panier sous la forme que le serveur attend, **trié** pour être comparable. */
  private readonly payload = computed<ShopCartPayload>(() => {
    const quantities = this.store.quantities();
    return {
      lines: Object.keys(quantities)
        .sort((a, b) => a.localeCompare(b))
        .map((sku) => ({ sku, quantity: quantities[sku] ?? 0 })),
    };
  });

  constructor() {
    // La reprise n'a lieu qu'une fois, à la première reconnaissance. Une
    // seconde lecture à chaque battement d'`isAuthenticated` reposerait par
    // dessus ce que le client vient de composer.
    effect(() => {
      if (this.auth.isAuthenticated() && !this.resuming()) {
        this.resume();
      }
    });

    toObservable(this.payload)
      .pipe(
        // 🔴 L'accalmie vient EN PREMIER, et rien ne décide avant elle.
        //
        // Les deux gardes ci-dessous lisent un état qui change pendant
        // l'attente : la reprise arrive, et avec elle ce que le serveur porte
        // déjà. Placées avant le `debounceTime`, elles jugeaient l'état du
        // panier au moment de la frappe — donc la copie d'AVANT la reprise
        // repartait au serveur trois cents millisecondes plus tard, écrasant
        // celle qu'on venait d'en recevoir.
        debounceTime(SAVE_DEBOUNCE_MS),
        filter(() => this.resumed()),
        // Sur la forme SÉRIALISÉE : `computed` rend un objet neuf à chaque
        // lecture, et une comparaison par référence ne filtrerait jamais rien.
        filter((payload) => keyOf(payload) !== this.lastSaved),
        switchMap((payload) => this.push(payload)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /**
   * Relit le panier gardé chez nous et tranche entre les deux copies.
   *
   * Un échec de lecture n'est pas un panier vide : on marque la reprise faite
   * pour que les gestes suivants s'écrivent, mais on ne touche à rien de ce que
   * le client a sous les yeux. Perdre la synchronisation d'une session vaut
   * mieux que vider un panier parce que le réseau a hoqueté.
   */
  private resume(): void {
    this.resuming.set(true);
    this.gateway
      .load()
      .pipe(
        tap((remote) => {
          this.reconcile(remote);
        }),
        catchError(() => of(null)),
        // `finalize` et non `tap` : l'écriture reprend aussi bien après un
        // échec de lecture. Rester muet parce que le réseau a hoqueté une fois
        // priverait le client de sa reprise pour toute la session.
        finalize(() => {
          this.resumed.set(true);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private reconcile(remote: ShopCartView | null): void {
    if (remote === null) {
      // Rien chez nous : la copie locale est la seule qui existe, et elle monte
      // — **si elle contient quelque chose**. Ouvrir la boutique et se
      // connecter ne compose pas un panier : écrire une ligne vide à chaque
      // visite remplirait la table de paniers que personne n'a commencés, et
      // rendrait la relance d'abandon illisible.
      const local = this.payload();
      if (local.lines.length > 0) {
        this.pushNow();
      } else {
        this.lastSaved = keyOf(local);
      }
      return;
    }
    if (wins(this.store.savedAt(), remote.savedAt)) {
      this.pushNow();
      return;
    }
    this.lastSaved = keyOf({ lines: remote.lines });
    this.store.replaceAll(quantitiesOf(remote), remote.savedAt);
  }

  /** Écrit sans attendre l'accalmie : la reprise n'est pas une frappe. */
  private pushNow(): void {
    this.push(this.payload()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  /**
   * L'écriture, et l'oubli de son échec.
   *
   * Un `PUT` raté ne se signale nulle part, et c'est voulu : le client n'a rien
   * demandé, son panier est intact devant lui, et une bannière d'erreur ne lui
   * apprendrait rien qu'il puisse corriger. `catchError` garde le flux vivant —
   * sans lui, une coupure réseau éteindrait la synchronisation pour le reste de
   * la session.
   */
  private push(payload: ShopCartPayload) {
    return this.gateway.save(payload).pipe(
      tap(() => {
        this.lastSaved = keyOf(payload);
      }),
      catchError(() => of(null)),
    );
  }
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
 * tout ce qui est daté : un panier d'avant ce chantier cède devant une copie
 * serveur. À égalité stricte, c'est le serveur qui garde la main — il n'y a
 * alors rien à écrire, et se taire coûte moins qu'un aller-retour.
 */
function wins(localAt: string | null, remoteAt: string): boolean {
  return localAt !== null && localAt > remoteAt;
}
