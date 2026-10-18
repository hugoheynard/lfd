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
import type { UsualSuggestionView } from '@lfd/contracts';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { CartStore } from '../cart/cart.store';
import { ClientWorkspace } from '../client-workspace.service';
import { OrderContextStore } from '../order-context.store';
import { suggestionOrigin } from './suggestion-origin';
import { cartSkus, suggestionTarget } from './suggestion-target';

/**
 * **« Vos habituels »** (R1) : ce que la société du lecteur commande
 * régulièrement — huit places au plus, c'est le commerce qui le tient.
 *
 * Pour un PRO seulement : une personne connectée dont l'espace courant est
 * une société. Un invité, un particulier ou l'espace perso ne demandent rien
 * (il n'y a pas de route publique, et R3 attend l'avis du cabinet). Une
 * demande par affichage de l'accueil ; rien en SSR ; la requête vit dans le
 * morceau des suggestions.
 *
 * Il compte ce qu'il montre, sous la source `data` et le genre de la raison
 * (`weekly_rhythm`, `frequent`) : `suggestion_shown` une fois par article et
 * par affichage, `suggestion_clicked` quand la carte ouvre la fiche,
 * `suggestion_added` quand son « + » ajoute.
 */
@Injectable()
export class UsualPicks {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly audience = inject(ProductAudience);

  private readonly served = signal<readonly UsualSuggestionView[]>([]);
  private asked = false;
  private readonly shown = new Set<string>();

  /** Ce que l'accueil montre — un article entré au panier y cède sa place. */
  readonly current = computed(() => {
    const quantities = this.store.quantities();
    return this.served().filter((view) => (quantities[view.sku] ?? 0) === 0);
  });

  /** Un pro reconnu, son espace résolu à une société. */
  private readonly pro = computed(
    () =>
      this.browser &&
      this.auth.isAuthenticated() &&
      this.workspace.current() !== null &&
      this.workspace.company() !== null,
  );

  constructor() {
    effect(() => {
      if (this.pro() && !this.asked) {
        this.asked = true;
        untracked(() => void this.fetch());
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

  /** Le client ouvre la fiche de l'habituel, sans l'ajouter. */
  opened(view: UsualSuggestionView): void {
    this.count(view, 'suggestion_clicked');
  }

  /** Le client ajoute l'habituel par le « + ». */
  taken(view: UsualSuggestionView): void {
    this.count(view, 'suggestion_added');
  }

  private count(
    view: UsualSuggestionView,
    event: 'suggestion_shown' | 'suggestion_clicked' | 'suggestion_added',
  ): void {
    this.audience.record(view.sku, event, suggestionOrigin(view.reason));
  }

  private async fetch(): Promise<void> {
    const payload = {
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
    };
    try {
      const { fetchUsualSuggestions } = await import('./staff-suggestion.fetch');
      this.served.set(await fetchUsualSuggestions(this.http, payload, this.auth.accessToken$()));
    } catch {
      // Une suggestion qui échoue ne montre rien : jamais un accueil bloqué.
    }
  }
}
