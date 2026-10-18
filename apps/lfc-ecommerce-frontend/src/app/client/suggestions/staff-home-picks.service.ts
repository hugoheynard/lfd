import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import type { HomeSuggestionView } from '@lfd/contracts';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { CartStore } from '../cart/cart.store';
import { ClientWorkspace } from '../client-workspace.service';
import { OrderContextStore } from '../order-context.store';
import { cartSkus, suggestionTarget } from './suggestion-target';

/**
 * **Les suggestions du staff à l'accueil** (RS7) : deux places, « partout »
 * seulement — c'est le commerce qui le tient.
 *
 * Fourni par la rangée qui les montre : une demande par affichage de
 * l'accueil, le panier et le jour visé lus au départ ; rien en SSR ; la
 * requête vit dans un morceau chargé à la demande. Sans règle, rien.
 *
 * Il compte ce qu'il montre : `suggestion_shown` une fois par article et par
 * affichage, `suggestion_clicked` et `suggestion_added` au geste — source
 * `staff`, emplacement = l'id de la règle.
 */
@Injectable()
export class StaffHomePicks {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly audience = inject(ProductAudience);

  private readonly served = signal<readonly HomeSuggestionView[]>([]);
  private asked = false;
  private readonly shown = new Set<string>();

  /** Ce que l'accueil montre — un article entré au panier y cède sa place. */
  readonly current = computed(() => {
    const quantities = this.store.quantities();
    return this.served().filter((view) => (quantities[view.sku] ?? 0) === 0);
  });

  /** Lecteur reconnu : son espace, attendu avant de demander. */
  private readonly ready = computed<{ readonly authenticated: boolean } | null>(() => {
    if (!this.browser) {
      return null;
    }
    const authenticated = this.auth.isAuthenticated();
    return authenticated && this.workspace.current() === null ? null : { authenticated };
  });

  constructor() {
    effect(() => {
      const ready = this.ready();
      if (ready !== null && !this.asked) {
        this.asked = true;
        untracked(() => void this.fetch(ready.authenticated));
      }
    });
    effect(() => {
      for (const view of this.current()) {
        if (!this.shown.has(view.sku)) {
          this.shown.add(view.sku);
          untracked(() => this.count(view, 'suggestion_shown'));
        }
      }
    });
  }

  /** Le client prend une suggestion : la carte est cliquée, l'article ajouté. */
  taken(view: HomeSuggestionView): void {
    this.count(view, 'suggestion_clicked');
    this.count(view, 'suggestion_added');
  }

  private count(
    view: HomeSuggestionView,
    event: 'suggestion_shown' | 'suggestion_clicked' | 'suggestion_added',
  ): void {
    this.audience.record(view.sku, event, { source: 'staff', placement: view.reason.ruleId });
  }

  private async fetch(authenticated: boolean): Promise<void> {
    const payload = {
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
    };
    try {
      const token = authenticated ? this.auth.accessToken$() : null;
      const { fetchStaffSuggestions } = await import('./staff-suggestion.fetch');
      this.served.set(await fetchStaffSuggestions(this.http, 'home', payload, token));
    } catch {
      // Une suggestion qui échoue ne montre rien : jamais un accueil bloqué.
    }
  }
}
