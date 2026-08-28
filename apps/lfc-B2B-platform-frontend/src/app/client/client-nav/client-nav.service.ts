import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { formatEuro } from '../cart-total';
import { ClientCart } from '../client-cart.service';
import { ClientOrders } from '../client-orders.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { MOCK_CLIENT } from '../mock-client';

/** Une destination du menu, telle qu'elle est DÉCLARÉE — sans compteur ni libellé. */
interface Destination {
  readonly id: 'shop' | 'cart' | 'orders' | 'invoices' | 'account';
  readonly route: string;
  /**
   * L'écran existe-t-il ?
   *
   * Faux ne retire pas la destination : la réf pose que **l'ordre des cinq ne
   * change jamais** entre le menu mobile, la sous-barre et le rail. Une
   * destination qui disparaîtrait le temps qu'on écrive son écran ferait bouger
   * les quatre autres, et l'habitude du pouce avec.
   */
  readonly ready: boolean;
}

/** L'ordre, et il est le même partout. Voir `07-accueil-connecte.md`. */
const DESTINATIONS: readonly Destination[] = [
  { id: 'shop', route: '/commande/boutique', ready: true },
  { id: 'cart', route: '/commande/panier', ready: true },
  { id: 'orders', route: '/mes-commandes', ready: false },
  { id: 'invoices', route: '/mes-factures', ready: false },
  { id: 'account', route: '/mon-compte', ready: false },
];

/** Une destination prête à être dessinée, dans l'une ou l'autre des deux formes. */
export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly ready: boolean;
  /**
   * Le compteur LONG (`7 · 13,70 €`, `1 à régler`) — seul le menu mobile pleine
   * page a la largeur de l'écrire.
   */
  readonly count: string;
  /** Le compteur COURT (`7`, `14`, `1`) — celui des deux bandes horizontales. */
  readonly countShort: string;
  /** Ce qui appelle une action plutôt qu'il n'informe : la pastille passe au beurre. */
  readonly warn: boolean;
}

/**
 * Les cinq destinations de l'app cliente, comptées.
 *
 * Un seul endroit les déclare, et les trois surfaces qui les affichent (menu
 * mobile, sous-barre desktop, et le rail le jour où il existera) le lisent : la
 * réf exige que leur ORDRE ne varie jamais d'une surface à l'autre, ce qu'aucune
 * relecture ne garantit si chacune tient sa propre liste.
 *
 * Les compteurs viennent des mêmes sources que les écrans — le panier réel, les
 * commandes réellement passées. Seules les factures n'ont pas encore de modèle
 * et sortent de `MOCK_CLIENT`, comme le reste de ce qui viendra du compte.
 */
@Injectable({ providedIn: 'root' })
export class ClientNav {
  private readonly cart = inject(ClientCart);
  private readonly orders = inject(ClientOrders);
  private readonly t = inject(ClientCopyService).t;
  private readonly router = inject(Router);

  /**
   * L'adresse courante, en SIGNAL.
   *
   * `Router.url` est une propriété nue : un `computed()` qui la lirait ne se
   * recalculerait jamais, et l'onglet actif resterait figé sur celui de la
   * première page — un défaut qui ne se voit qu'en naviguant, donc jamais dans
   * un rendu isolé.
   *
   * Elle vit ici et pas dans les deux composants : le menu et la sous-barre
   * doivent souligner LA MÊME destination, et deux dérivations séparées sont
   * deux occasions de diverger.
   */
  readonly current = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0] ?? ''),
    ),
    { initialValue: this.router.url.split('?')[0] ?? '' },
  );

  readonly items = computed<readonly NavItem[]>(() =>
    DESTINATIONS.map((d) => ({
      ...d,
      label: this.t().nav.destinations[d.id],
      ...this.counts(d.id),
    })),
  );

  /** Le nombre d'items porteurs d'un compteur — ce que la cloche du menu annonce. */
  readonly pending = computed(() => this.items().filter((i) => i.countShort !== '').length);

  private counts(id: Destination['id']): Pick<NavItem, 'count' | 'countShort' | 'warn'> {
    if (id === 'cart') {
      const pieces = this.cart.count();
      return pieces === 0
        ? EMPTY
        : {
            count: `${pieces} · ${formatEuro(this.cart.totals().total)}`,
            countShort: String(pieces),
            warn: false,
          };
    }
    if (id === 'orders') {
      const placed = this.orders.all().length;
      return placed === 0
        ? EMPTY
        : { count: String(placed), countShort: String(placed), warn: false };
    }
    if (id === 'invoices') {
      // Annoté large à dessein : `MOCK_CLIENT` est figé `as const`, donc son
      // littéral `1` ferait passer le test à zéro pour une comparaison morte.
      // Le jour où le compte porte vraiment ce nombre, le garde est déjà là.
      const due: number = MOCK_CLIENT.invoicesDue;
      return due === 0
        ? EMPTY
        : {
            count: this.t().nav.invoicesDue.replace('{n}', String(due)),
            countShort: String(due),
            warn: true,
          };
    }
    return EMPTY;
  }
}

/** Pas de compteur : la pastille n'existe pas, elle n'est pas à zéro. */
const EMPTY = { count: '', countShort: '', warn: false } as const;
