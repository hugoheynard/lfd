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
// Par le sous-chemin sans zod : l'accueil est au démarrage.
import { PERSONAL_WORKSPACE } from '@lfd/contracts/workspace';
import { defer, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { CartStore } from '../cart/cart.store';
import { ClientContext, VISITOR } from '../client-context.service';
import { contextKeyed, type ContextKey } from '../context-keyed/context-keyed';
import { OrderContextStore } from '../order-context.store';
import { suggestionOrigin } from './suggestion-origin';
import { cartSkus, suggestionTarget } from './suggestion-target';

/**
 * **« Vos habituels »** (R1) : ce que la société du lecteur commande
 * régulièrement — huit places au plus, c'est le commerce qui le tient.
 *
 * Pour un PRO seulement : une personne connectée dont l'espace affiché est
 * une société. Un invité, un particulier ou l'espace perso ne demandent rien
 * (il n'y a pas de route publique, et R3 attend l'avis du cabinet). Une
 * demande par affichage de l'accueil et par société ; rien en SSR ; la
 * requête vit dans le morceau des suggestions.
 *
 * Rangé par la brique (lot d de `caching-usage/plan-espace-retenu.md`) : les
 * habituels d'une société ne se montrent jamais sous une autre, même le temps
 * d'une requête.
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
  private readonly context = inject(ClientContext);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly audience = inject(ProductAudience);

  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);
  private readonly shown = new Set<string>();

  private readonly keyed = contextKeyed((key) => this.load(key));

  /**
   * La clé d'un pro : l'espace affiché, s'il est une société. `null` en SSR,
   * pour un visiteur, en perso, ou tant que l'espace n'est pas connu.
   */
  private readonly key = computed<ContextKey | null>(
    () => {
      const workspace = this.browser ? this.context.prefix() : null;
      const company =
        workspace !== null && workspace !== VISITOR && workspace !== PERSONAL_WORKSPACE;
      return company ? { workspace, own: '' } : null;
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
  private load(key: ContextKey): Observable<readonly UsualSuggestionView[]> {
    const payload = {
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
    };
    return defer(() => import('./staff-suggestion.fetch')).pipe(
      switchMap(({ usualSuggestionsFor }) =>
        usualSuggestionsFor(this.http, payload, this.auth.accessToken$(), key),
      ),
    );
  }
}
