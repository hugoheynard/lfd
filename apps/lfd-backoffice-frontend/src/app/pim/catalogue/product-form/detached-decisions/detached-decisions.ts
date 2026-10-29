import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { SaleReferenceDecisionView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { SaleReferenceDecisionsService } from '../../../../b2b/tarification/sale-reference-decisions.service';
import { ProductFormStore } from '../product-form-store';
import { decisionLine } from './detached-decisions-lines';

type LoadState = 'idle' | 'ready' | 'error';

/**
 * **Les décisions tarifaires restées sur l’ancienne référence**
 * (`plan-pro-voit-les-declinaisons.md`, L7 d) — sur une fiche née d’un
 * détachement.
 *
 * Le tarif est à plat : une mercuriale, une règle, un plancher posés sur
 * l’ancienne référence ne valent que pour elle, et le détachement ne les
 * déplace pas (D2 de `plan-gestes-de-declinaison.md`). L’écran les liste, en
 * lecture seule ; les reposer sur la nouvelle référence est un geste staff
 * explicite qui n’existe pas encore (lot suivant du plan).
 *
 * L’ancienne référence vient de la filiation du référentiel
 * (`lineage.origin.variantSku`) : la fiche née inactive n’a pas encore
 * d’article au commerce, et la liste doit se lire avant qu’elle se vende.
 */
@Component({
  selector: 'app-detached-decisions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './detached-decisions.html',
  styleUrl: './detached-decisions.scss',
})
export class DetachedDecisions {
  protected readonly store = inject(ProductFormStore);
  private readonly decisions = inject(SaleReferenceDecisionsService);

  protected readonly state = signal<LoadState>('idle');
  private readonly views = signal<readonly SaleReferenceDecisionView[]>([]);

  protected readonly originSku = computed(() => this.store.lineage().origin?.variantSku ?? null);
  protected readonly lines = computed(() =>
    this.views().map((view) => ({ id: view.id, text: decisionLine(view) })),
  );

  constructor() {
    effect(() => {
      const sku = this.originSku();
      if (sku !== null) {
        void this.load(sku);
      }
    });
  }

  private async load(sku: string): Promise<void> {
    try {
      this.views.set(await this.decisions.standingOn(sku));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
