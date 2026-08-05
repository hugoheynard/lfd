import { Injectable, computed, inject } from '@angular/core';

import { CategoryStore } from '../catalogue/category-store';
import { ProductStore } from '../catalogue/product-store';
import { TvaStore } from '../catalogue/tva-regimes/tva-store';
import { LocalDb } from '../data/local-db';
import { buildProjection, planPublication, type PublicationPlan } from '../data/publication';

/**
 * Publication **catalogue FOLIE COFFEE → Shopify** (POC frontend-only).
 *
 * Le plan (nouvelles / modifiées / à jour / à retirer) est **dérivé** en direct
 * du catalogue ; approuver « pousse » = fige la projection courante dans
 * `publishedFiches` (l'état Shopify simulé). Aucun appel réseau : la connexion
 * réelle passera par {@link ShopifyChannelApi} le jour où le token sera posé.
 */
@Injectable({ providedIn: 'root' })
export class PublicationApi {
  private readonly db = inject(LocalDb);
  private readonly products = inject(ProductStore);
  private readonly categories = inject(CategoryStore);
  private readonly regimes = inject(TvaStore);

  /**
   * Le plan de publication, recalculé à chaque changement du catalogue. Produits,
   * familles et régimes viennent des stores backend (le join de projection se
   * referme) ; seul l'état publié reste local (POC, pas de backend Shopify réel).
   */
  readonly plan = computed<PublicationPlan>(() =>
    planPublication(
      buildProjection(this.products.items(), this.categories.items(), this.regimes.items()),
      this.db.snapshot().publishedFiches,
    ),
  );

  /** Le push programmé en attente, ou `null`. */
  readonly scheduled = computed(() => this.db.snapshot().scheduledPush);

  /**
   * Approuve et « pousse » les fiches ciblées : une fiche courante fige sa
   * projection dans l'état publié ; une fiche « à retirer » disparaît de l'état
   * publié. Consomme le push programmé s'il ne visait que ces fiches.
   */
  approveAndPush(handles: readonly string[]): void {
    const targets = new Set(handles);
    const current = buildProjection(
      this.products.items(),
      this.categories.items(),
      this.regimes.items(),
    );
    this.db.update((draft) => {
      for (const handle of targets) {
        const fiche = current.get(handle);
        if (fiche) {
          draft.publishedFiches[handle] = fiche;
        } else {
          delete draft.publishedFiches[handle];
        }
      }
      if (draft.scheduledPush && draft.scheduledPush.handles.every((h) => targets.has(h))) {
        draft.scheduledPush = null;
      }
    });
  }

  /** Programme un push des fiches ciblées pour l'instant `at` (ISO). */
  schedule(at: string, handles: readonly string[]): void {
    this.db.update((draft) => {
      draft.scheduledPush = { at, handles: [...handles] };
    });
  }

  cancelSchedule(): void {
    this.db.update((draft) => {
      draft.scheduledPush = null;
    });
  }

  /** Exécute un push programmé arrivé à échéance (appelé à l'ouverture). */
  runDueSchedule(nowIso: string): void {
    const pending = this.db.snapshot().scheduledPush;
    if (pending !== null && pending.at <= nowIso) {
      this.approveAndPush(pending.handles);
    }
  }
}
