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
import { defer, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { CartStore } from '../cart/cart.store';
import { ClientContext } from '../client-context.service';
import { contextKeyed, type ContextKey } from '../context-keyed/context-keyed';
import { OrderContextStore } from '../order-context.store';
import { cartSkus, suggestionTarget } from './suggestion-target';

/** Une ouverture de fiche : son rang (une demande par ouverture) et son article. */
interface Opening {
  readonly id: number;
  readonly sku: string;
}

/** Une ouverture dont la réponse est arrivée, et la clé sous laquelle elle est rangée. */
interface Served {
  readonly opening: number;
  readonly key: ContextKey;
}

/**
 * **La suggestion du staff sur la fiche d'un article** (RS2, fiche, de
 * `documentation/recommandation-produit/suggestions-du-staff.md`).
 *
 * Une requête par ouverture de fiche — le panier et le jour visé sont lus au
 * moment où elle part, pas suivis ; rien en SSR ; la requête vit dans un
 * morceau chargé à la demande. Sans règle applicable, rien.
 *
 * Rangée par la brique (lot d de `caching-usage/plan-espace-retenu.md`) sous
 * l'espace affiché et l'article — une entrée par article, réécrite à chaque
 * ouverture : la suggestion lue pour un autre espace ne se montre jamais.
 *
 * Elle compte ce qu'elle montre : `suggestion_shown` une fois par ouverture,
 * `suggestion_clicked` quand la carte ouvre la fiche, `suggestion_added`
 * quand son « + » ajoute (Hugo, 2026-10-18 : deux gestes, deux compteurs) — source `staff`,
 * emplacement = l'id de la règle.
 */
@Injectable({ providedIn: 'root' })
export class StaffProductSuggestion {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);
  private readonly order = inject(OrderContextStore);
  private readonly store = inject(CartStore);
  private readonly audience = inject(ProductAudience);

  private readonly opening = signal<Opening | null>(null);
  /** La dernière ouverture servie : la brique n'est pas un signal. */
  private readonly served = signal<Served | null>(null);
  /** Le rang survit à la fermeture : une réouverture est une ouverture neuve. */
  private openings = 0;
  private asked: string | null = null;
  private shown: number | null = null;

  private readonly keyed = contextKeyed((key) => this.load(key));

  /** La clé de la fiche ouverte — `null` en SSR, fermée, ou tant que l'espace n'est pas connu. */
  private readonly key = computed<ContextKey | null>(
    () => {
      const opening = this.opening();
      const workspace = this.browser ? this.context.prefix() : null;
      return opening === null || workspace === null ? null : { workspace, own: opening.sku };
    },
    { equal: (a, b) => a?.workspace === b?.workspace && a?.own === b?.own },
  );

  /** Ce que la fiche ouverte montre — jamais un article déjà au panier. */
  readonly current = computed(() => {
    const opening = this.opening();
    const key = this.key();
    const served = this.served();
    if (opening === null || key === null || served?.opening !== opening.id) {
      return null;
    }
    if (served.key.workspace !== key.workspace) {
      return null;
    }
    const view = this.keyed.shown(key)?.[0];
    return view !== undefined && (this.store.quantities()[view.sku] ?? 0) === 0 ? view : null;
  });

  constructor() {
    effect(() => {
      const opening = this.opening();
      const key = this.key();
      if (opening === null || key === null) {
        return;
      }
      // Une demande par ouverture ET par espace : une bascule pendant que la
      // fiche est ouverte relit pour le nouvel espace.
      const ask = `${opening.id}\u0000${key.workspace}`;
      if (this.asked !== ask) {
        this.asked = ask;
        untracked(() => void this.fetch(opening, key));
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

  /** Le client ouvre la fiche de l'article suggéré, sans l'ajouter. */
  opened(view: ProductSuggestionView): void {
    this.count(view, 'suggestion_clicked');
  }

  /** Le client ajoute l'article suggéré par le « + ». */
  taken(view: ProductSuggestionView): void {
    this.count(view, 'suggestion_added');
  }

  private count(
    view: ProductSuggestionView,
    event: 'suggestion_shown' | 'suggestion_clicked' | 'suggestion_added',
  ): void {
    this.audience.record(view.sku, event, { source: 'staff', placement: view.reason.ruleId });
  }

  private async fetch(opening: Opening, key: ContextKey): Promise<void> {
    try {
      await this.keyed.read(key);
    } catch {
      // Une suggestion qui échoue ne montre rien : jamais une fiche bloquée.
      return;
    }
    // Une réponse d'une ouverture déjà remplacée ne sert plus.
    if (untracked(() => this.opening())?.id === opening.id) {
      this.served.set({ opening: opening.id, key });
    }
  }

  /** L'appel d'une clé, le panier et le jour visé lus à son départ. */
  private load(key: ContextKey): Observable<readonly ProductSuggestionView[]> {
    const payload = {
      sku: key.own,
      skus: cartSkus(this.store.quantities()),
      target: suggestionTarget(this.order.choice()),
    };
    return defer(() => import('./staff-suggestion.fetch')).pipe(
      switchMap(({ productSuggestionsFor }) =>
        productSuggestionsFor(this.http, payload, this.auth.accessToken$(), key),
      ),
    );
  }
}
