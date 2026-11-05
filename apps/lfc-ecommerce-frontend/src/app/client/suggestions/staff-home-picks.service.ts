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
import { defer, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { CartStore } from '../cart/cart.store';
import { ClientContext } from '../client-context.service';
import { contextKeyed, type ContextKey } from '../context-keyed/context-keyed';
import { OrderContextStore } from '../order-context.store';
import { cartSkus, suggestionTarget } from './suggestion-target';

/**
 * **Les suggestions du staff à l'accueil** (RS7) : deux places, « partout »
 * seulement — c'est le commerce qui le tient.
 *
 * Fourni par la rangée qui les montre : une demande par affichage de
 * l'accueil et par espace, le panier et le jour visé lus au départ ; rien en
 * SSR ; la requête vit dans un morceau chargé à la demande. Sans règle, rien.
 *
 * Rangé par la brique (lot d de `caching-usage/dans-quel-espace-est-le-client.md`) : la
 * clé est l'espace que `ClientContext` affiche, et rien de ce qui a été lu
 * pour un autre espace n'est montré — même le temps d'une requête.
 *
 * Il compte ce qu'il montre : `suggestion_shown` une fois par article et par
 * affichage, `suggestion_clicked` quand la carte ouvre la fiche, `suggestion_added`
 * quand son « + » ajoute (Hugo, 2026-10-18 : deux gestes, deux compteurs) — source
 * `staff`, emplacement = l'id de la règle.
 */
@Injectable()
export class StaffHomePicks {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly audience = inject(ProductAudience);

  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);
  private readonly shown = new Set<string>();

  private readonly keyed = contextKeyed((key) => this.load(key));

  /** La clé de qui regarde — `null` en SSR, ou tant que son espace n'est pas connu. */
  private readonly key = computed<ContextKey | null>(
    () => {
      const workspace = this.browser ? this.context.prefix() : null;
      return workspace === null ? null : { workspace, own: '' };
    },
    { equal: (a, b) => a?.workspace === b?.workspace },
  );

  /** Ce que l'accueil montre — un article entré au panier y cède sa place. */
  readonly current = computed(() => {
    this.answered();
    const key = this.key();
    const served = (key === null ? undefined : this.keyed.shown(key)) ?? [];
    const quantities = this.store.quantities();
    return served.filter((view) => (quantities[view.sku] ?? 0) === 0);
  });

  constructor() {
    effect(() => {
      const key = this.key();
      if (key !== null) {
        untracked(() => void this.ask(key));
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

  /** Le client ouvre la fiche de l'article suggéré, sans l'ajouter. */
  opened(view: HomeSuggestionView): void {
    this.count(view, 'suggestion_clicked');
  }

  /** Le client ajoute l'article suggéré par le « + ». */
  taken(view: HomeSuggestionView): void {
    this.count(view, 'suggestion_added');
  }

  private count(
    view: HomeSuggestionView,
    event: 'suggestion_shown' | 'suggestion_clicked' | 'suggestion_added',
  ): void {
    this.audience.record(view.sku, event, { source: 'staff', placement: view.reason.ruleId });
  }

  private async ask(key: ContextKey): Promise<void> {
    try {
      await this.keyed.ensure(key);
    } catch {
      // Une suggestion qui échoue ne montre rien : jamais un accueil bloqué.
      return;
    }
    this.answered.update((count) => count + 1);
  }

  /** L'appel d'une clé, le panier et le jour visé lus à son départ. */
  private load(key: ContextKey): Observable<readonly HomeSuggestionView[]> {
    const payload = {
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
    };
    return defer(() => import('./staff-suggestion.fetch')).pipe(
      switchMap(({ homeSuggestionsFor }) =>
        homeSuggestionsFor(this.http, payload, this.auth.accessToken$(), key),
      ),
    );
  }
}
