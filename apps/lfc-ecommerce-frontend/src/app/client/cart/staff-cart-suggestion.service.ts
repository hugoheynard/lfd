import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import type { CartSuggestionsPayload, CartSuggestionView } from '@lfd/contracts';

import { settlesOnAccount } from '../../account/settles-on-account';
import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { ClientCompany } from '../client-company.service';
import { ClientWorkspace } from '../client-workspace.service';
import { OrderContextStore } from '../order-context.store';
import { suggestionOrigin } from '../suggestions/suggestion-origin';
import { cartSkus, suggestionTarget } from '../suggestions/suggestion-target';
import { CartStore } from './cart.store';
import { ClientCart } from './client-cart.service';
import { shownCartTotalCents } from './shown-cart-total';

/** Le panier se compose au clic : on attend qu'il se pose avant de demander. */
export const CART_SUGGESTION_DEBOUNCE_MS = 400;

/** Une demande : sa clé (lecteur + panier + jour visé), son corps, et la route. */
interface SuggestionRequest {
  readonly key: string;
  readonly payload: CartSuggestionsPayload;
  readonly authenticated: boolean;
}

/**
 * **Les suggestions du panier** : celle du staff (RS2, de
 * `documentation/recommandation-produit/suggestions-du-staff.md`), puis la
 * calculée « souvent pris avec » (R2) à sa propre place — le serveur rend
 * les deux dans cet ordre, au plus une de chaque.
 *
 * Elle envoie le panier, le jour visé et son point de retrait, et le total
 * que le client lit quand il est chiffré (RS8 : créneau, seuil, point).
 *
 * Sans règle applicable ni paire assez partagée, le panier ne montre rien (la relance codée en dur,
 * `CartUpsell`, est retirée le 2026-10-18). Rien en SSR ; une requête par ouverture du panier et
 * par changement de son contenu, du lecteur ou du jour visé, après
 * {@link CART_SUGGESTION_DEBOUNCE_MS} ; la requête vit dans un morceau chargé
 * à la demande.
 *
 * Elle compte ce qu'elle montre : `suggestion_shown` une fois par article et
 * par ouverture, `suggestion_clicked` quand la carte ouvre la fiche, `suggestion_added`
 * quand son « + » ajoute (Hugo, 2026-10-18 : deux gestes, deux compteurs) — source
 * `staff` à l'id de la règle, ou `data` à `bought_with` (`suggestionOrigin`).
 */
@Injectable({ providedIn: 'root' })
export class StaffCartSuggestion {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly audience = inject(ProductAudience);
  private readonly cart = inject(ClientCart);
  private readonly firm = inject(ClientCompany);

  private readonly openings = signal(0);
  private readonly served = signal<readonly CartSuggestionView[]>([]);
  private shownThisOpening = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private asked: string | null = null;

  /** Le panier est ouvert : l'après-ajout s'y tait, la carte du panier y parle déjà. */
  readonly isOpen = computed(() => this.openings() > 0);

  /** Ce que le panier montre, le décidé d'abord — jamais un article qu'il contient déjà. */
  readonly shown = computed(() => {
    const quantities = this.store.quantities();
    return this.served().filter((view) => (quantities[view.sku] ?? 0) === 0);
  });

  /** La demande à faire, ou `null` : panier fermé, SSR, ou espace pas encore connu. */
  private readonly request = computed<SuggestionRequest | null>(() => {
    if (!this.browser || this.openings() === 0) {
      return null;
    }
    const authenticated = this.auth.isAuthenticated();
    const space = authenticated ? this.workspace.current() : null;
    if (authenticated && space === null) {
      return null;
    }
    const payload = this.payload();
    return { key: JSON.stringify({ space, payload }), payload, authenticated };
  });

  constructor() {
    effect(() => {
      const request = this.request();
      if (request === null) {
        this.cancel();
      } else {
        this.schedule(request);
      }
    });
    effect(() => {
      const views = this.shown();
      if (this.openings() === 0) {
        return;
      }
      for (const view of views.filter(({ sku }) => !this.shownThisOpening.has(sku))) {
        this.shownThisOpening.add(view.sku);
        this.count(view, 'suggestion_shown');
      }
    });
  }

  /** Le panier s'ouvre : une nouvelle ouverture recompte ce qu'elle montre. */
  open(): void {
    this.shownThisOpening = new Set();
    this.asked = null;
    this.openings.update((count) => count + 1);
  }

  close(): void {
    this.openings.update((count) => Math.max(0, count - 1));
  }

  /** Le client ouvre la fiche de l'article suggéré, sans l'ajouter. */
  opened(view: CartSuggestionView): void {
    this.count(view, 'suggestion_clicked');
  }

  /** Le client ajoute l'article suggéré par le « + ». */
  taken(view: CartSuggestionView): void {
    this.count(view, 'suggestion_added');
  }

  private count(
    view: CartSuggestionView,
    event: 'suggestion_shown' | 'suggestion_clicked' | 'suggestion_added',
  ): void {
    this.audience.record(view.sku, event, suggestionOrigin(view.reason));
  }

  private payload(): CartSuggestionsPayload {
    const total = this.shownTotalCents();
    return {
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
      ...(total === null ? {} : { cartTotalCents: total }),
    };
  }

  /**
   * Le total que le client lit au panier (RS8, seuil), seulement quand le
   * serveur l'a chiffré pour CE panier : pendant un nouveau décompte, l'ancien
   * total mentirait. Sans total, une règle à seuil ne paraît pas.
   */
  private shownTotalCents(): number | null {
    if (this.cart.pricing() !== 'ready') {
      return null;
    }
    return shownCartTotalCents(this.cart.totals(), settlesOnAccount(this.firm.company()));
  }

  private cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(request: SuggestionRequest): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.fetch(request);
    }, CART_SUGGESTION_DEBOUNCE_MS);
  }

  private async fetch({ key, payload, authenticated }: SuggestionRequest): Promise<void> {
    if (this.asked === key) {
      return;
    }
    this.asked = key;
    const token = authenticated ? this.auth.accessToken$() : null;
    try {
      const { fetchStaffSuggestions } = await import('../suggestions/staff-suggestion.fetch');
      const views = await fetchStaffSuggestions(this.http, 'cart', payload, token);
      if (this.asked === key) {
        this.served.set(views);
      }
    } catch {
      // Une suggestion qui échoue laisse la relance : jamais un geste bloqué.
      if (this.asked === key) {
        this.served.set([]);
      }
    }
  }
}
