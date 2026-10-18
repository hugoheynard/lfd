import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { CartSuggestionView } from '@lfd/contracts';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { CartEntries, type CartEntry } from '../cart/cart-entries';
import { CartStore } from '../cart/cart.store';
import { StaffCartSuggestion } from '../cart/staff-cart-suggestion.service';
import { ClientWorkspace } from '../client-workspace.service';
import { OrderContextStore } from '../order-context.store';
import { cartSkus, suggestionTarget } from './suggestion-target';

/** Ce que l'après-ajout propose, et à quelle entrée il répond. */
interface Offer {
  readonly entry: number;
  readonly view: CartSuggestionView;
}

/**
 * **L'après-ajout** (RS7) : quand un article entre au panier, la suggestion
 * du staff du PANIER, recalculée avec lui — pas un emplacement de plus, les
 * mêmes règles (`placement` `cart`), la même route.
 *
 * Une demande par entrée (`CartEntries`) : un « + » sur un article déjà
 * présent n'en est pas une. Rien quand le panier est ouvert — sa carte parle
 * déjà —, rien sans règle applicable, rien en SSR (le composant qui le lit
 * n'est chargé qu'à la première entrée). Une entrée plus récente remplace la proposition en cours.
 *
 * Il compte comme le panier : `suggestion_shown` une fois par proposition,
 * `suggestion_clicked` et `suggestion_added` au geste — source `staff`,
 * emplacement = l'id de la règle.
 */
@Injectable({ providedIn: 'root' })
export class AfterAddSuggestion {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly entries = inject(CartEntries);
  private readonly cartPick = inject(StaffCartSuggestion);
  private readonly audience = inject(ProductAudience);

  private readonly offer = signal<Offer | null>(null);
  /** Construit à la première entrée (`AfterAddHost`) : il répond aussi à celle-là. */
  private answered = 0;
  private shown = 0;

  /** La proposition en cours — jamais un article déjà au panier, jamais panier ouvert. */
  readonly current = computed(() => {
    const offer = this.offer();
    if (offer === null || this.cartPick.isOpen()) {
      return null;
    }
    return (this.store.quantities()[offer.view.sku] ?? 0) === 0 ? offer.view : null;
  });

  constructor() {
    effect(() => {
      const entry = this.entries.latest();
      if (entry !== null && entry.id > this.answered) {
        this.answered = entry.id;
        untracked(() => this.answer(entry));
      }
    });
    effect(() => {
      const offer = this.offer();
      if (offer !== null && this.current() !== null && this.shown !== offer.entry) {
        this.shown = offer.entry;
        untracked(() => this.count(offer.view, 'suggestion_shown'));
      }
    });
  }

  /** Le client prend la suggestion : la carte est cliquée, l'article ajouté. */
  taken(view: CartSuggestionView): void {
    this.count(view, 'suggestion_clicked');
    this.count(view, 'suggestion_added');
    this.offer.set(null);
  }

  /** Le client ferme le retour, ou il s'éteint de lui-même. */
  dismiss(): void {
    this.offer.set(null);
  }

  private answer(entry: CartEntry): void {
    this.offer.set(null);
    if (this.cartPick.isOpen()) {
      return;
    }
    const authenticated = this.auth.isAuthenticated();
    if (authenticated && this.workspace.current() === null) {
      return;
    }
    void this.fetch(entry, authenticated);
  }

  private async fetch(entry: CartEntry, authenticated: boolean): Promise<void> {
    const payload = {
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
    };
    try {
      const token = authenticated ? this.auth.accessToken$() : null;
      const { fetchStaffSuggestions } = await import('./staff-suggestion.fetch');
      const views = await fetchStaffSuggestions(this.http, 'cart', payload, token);
      const view = views[0];
      if (view !== undefined && entry.id === this.answered) {
        this.offer.set({ entry: entry.id, view });
      }
    } catch {
      // Une suggestion qui échoue ne montre rien : l'ajout, lui, est fait.
    }
  }

  private count(
    view: CartSuggestionView,
    event: 'suggestion_shown' | 'suggestion_clicked' | 'suggestion_added',
  ): void {
    this.audience.record(view.sku, event, { source: 'staff', placement: view.reason.ruleId });
  }
}
