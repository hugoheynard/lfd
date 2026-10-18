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
import type { ProductSuggestionView } from '@lfd/contracts';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { CartStore } from '../cart/cart.store';
import { ClientWorkspace } from '../client-workspace.service';
import { OrderContextStore } from '../order-context.store';
import { cartSkus, suggestionTarget } from './suggestion-target';

/** Une ouverture de fiche : son rang (une demande par ouverture) et son article. */
interface Opening {
  readonly id: number;
  readonly sku: string;
}

/**
 * **La suggestion du staff sur la fiche d'un article** (RS2, fiche, de
 * `documentation/recommandation-produit/suggestions-du-staff.md`).
 *
 * Une requête par ouverture de fiche — le panier et le jour visé sont lus au
 * moment où elle part, pas suivis ; rien en SSR ; la requête vit dans un
 * morceau chargé à la demande. Sans règle applicable, rien.
 *
 * Elle compte ce qu'elle montre : `suggestion_shown` une fois par ouverture,
 * `suggestion_clicked` et `suggestion_added` au geste — source `staff`,
 * emplacement = l'id de la règle.
 */
@Injectable({ providedIn: 'root' })
export class StaffProductSuggestion {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly audience = inject(ProductAudience);

  private readonly opening = signal<Opening | null>(null);
  private readonly served = signal<{
    readonly opening: number;
    readonly view: ProductSuggestionView;
  } | null>(null);
  /** Le rang survit à la fermeture : une réouverture est une ouverture neuve. */
  private openings = 0;
  private asked: number | null = null;
  private shown: number | null = null;

  /** Ce que la fiche ouverte montre — jamais un article déjà au panier. */
  readonly current = computed(() => {
    const opening = this.opening();
    const served = this.served();
    if (opening === null || served === null || served.opening !== opening.id) {
      return null;
    }
    return (this.store.quantities()[served.view.sku] ?? 0) === 0 ? served.view : null;
  });

  /** L'espace d'un lecteur reconnu, attendu avant de demander. */
  private readonly ready = computed<{
    readonly opening: Opening;
    readonly authenticated: boolean;
  } | null>(() => {
    const opening = this.opening();
    if (!this.browser || opening === null) {
      return null;
    }
    const authenticated = this.auth.isAuthenticated();
    return authenticated && this.workspace.current() === null ? null : { opening, authenticated };
  });

  constructor() {
    effect(() => {
      const ready = this.ready();
      if (ready !== null && this.asked !== ready.opening.id) {
        this.asked = ready.opening.id;
        untracked(() => void this.fetch(ready.opening, ready.authenticated));
      }
    });
    effect(() => {
      const view = this.current();
      const opening = this.opening();
      if (view !== null && opening !== null && this.shown !== opening.id) {
        this.shown = opening.id;
        this.count(view, 'suggestion_shown');
      }
    });
  }

  /** La fiche de `sku` s'ouvre : une demande, un affichage compté. */
  open(sku: string): void {
    this.openings += 1;
    this.opening.set({ id: this.openings, sku });
  }

  close(): void {
    this.opening.set(null);
  }

  /** Le client prend la suggestion : la carte est cliquée, l'article ajouté. */
  taken(view: ProductSuggestionView): void {
    this.count(view, 'suggestion_clicked');
    this.count(view, 'suggestion_added');
  }

  private count(
    view: ProductSuggestionView,
    event: 'suggestion_shown' | 'suggestion_clicked' | 'suggestion_added',
  ): void {
    this.audience.record(view.sku, event, { source: 'staff', placement: view.reason.ruleId });
  }

  private async fetch(opening: Opening, authenticated: boolean): Promise<void> {
    const payload = {
      sku: opening.sku,
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
    };
    const token = authenticated ? this.auth.accessToken$() : null;
    try {
      const { fetchStaffSuggestions } = await import('./staff-suggestion.fetch');
      const views = await fetchStaffSuggestions(this.http, 'product', payload, token);
      const view = views[0];
      if (view !== undefined) {
        this.served.set({ opening: opening.id, view });
      }
    } catch {
      // Une suggestion qui échoue ne montre rien : jamais une fiche bloquée.
    }
  }
}
